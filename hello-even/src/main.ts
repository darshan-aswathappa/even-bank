import { waitForEvenAppBridge, OsEventTypeList } from "@evenrealities/even_hub_sdk";
import { POST_PAIR_RETRIES, POST_PAIR_RETRY_MS, DEV_MODE } from "./config";
import { getLinkedItems, getTransactions, getRecurring, UnauthorizedError } from "./data/bankApi";
import {
  loadDeviceToken,
  persistDeviceToken,
  clearDeviceToken,
  getDeviceToken,
} from "./data/session";
import { startPairing, pollForToken, type PairingStart } from "./data/pairing";
import {
  type AppState,
  type Screen,
  initialState,
  withLinkedItems,
  withBalancePage,
  withTransactions,
  withRecurring,
  withAccountsPhase,
  withTransactionsPhase,
  withRecurringPhase,
  navigate,
  selectTransaction,
  selectedTransaction,
} from "./state/store";
import {
  initRender,
  createPage,
  rebuild,
  type PageContainers,
} from "./bridge/render";
import {
  balanceContainer,
  balanceContent,
  balanceTotalPages,
  balanceEmptyContainer,
  balanceEmptyMessage,
} from "./ui/balanceScreen";
import {
  txnTitleContainer,
  txnTitle,
  txnRows,
  txnListContainer,
  txnEmptyContainer,
  txnEmptyMessage,
} from "./ui/transactionsScreen";
import {
  recurringTitleContainer,
  recurringTitle,
  recurringRows,
  recurringListContainer,
  recurringEmptyContainer,
  recurringEmptyMessage,
} from "./ui/recurringScreen";
import { detailContainer, detailContent } from "./ui/detailScreen";
import { pairingContainer, pairingContent, pairingStatus } from "./ui/pairingScreen";
import {
  initPhone,
  showOnboarding as phoneOnboarding,
  showLinked as phoneLinked,
} from "./phone/phone";
import { setOnHiddenChange } from "./data/hiddenAccounts";

const bridge = await waitForEvenAppBridge();
initRender(bridge);

let state: AppState = initialState;
let pairingStart: PairingStart | null = null;
let pairingMessage: string | null = null;

await loadDeviceToken(bridge);

// Phone-side WebView UI (renders into #app — the companion-app surface). It uses
// the same device token as the glasses data calls. Its actions feed back into
// the glasses flow: unlink & unpair (or a 401) re-enters pairing.
initPhone({
  onUnpaired: () => void beginPairing(),
  onReauth: () => void handleUnauthorized(),
  onBanksUpdated: () => void refreshBalances(),
});

// No persistence cache: bank data is never seeded from storage. The app opens
// in its "loading" state and shows balances only once the first live fetch returns.

function buildContainers(s: AppState): PageContainers {
  if (s.screen === "pairing") {
    const content = pairingMessage
      ? pairingStatus(pairingMessage)
      : pairingStart
        ? pairingContent()
        : pairingStatus("Starting…");
    return { text: [pairingContainer(content)] };
  }
  if (s.screen === "recurring") {
    if (s.recurringStreams.length === 0) {
      return { text: [recurringEmptyContainer(recurringEmptyMessage(s))] };
    }
    return {
      text: [recurringTitleContainer(recurringTitle(s))],
      list: [recurringListContainer(recurringRows(s))],
    };
  }
  if (s.screen === "transactions") {
    if (s.transactions.length === 0) {
      return { text: [txnEmptyContainer(txnEmptyMessage(s))] };
    }
    return {
      text: [txnTitleContainer(txnTitle(s))],
      list: [txnListContainer(txnRows(s))],
    };
  }
  if (s.screen === "detail") {
    return { text: [detailContainer(detailContent(selectedTransaction(s)))] };
  }
  // balance screen — full-page text container with pixel-accurate justify()
  const content = balanceContent(s);
  if (!content) {
    return { text: [balanceEmptyContainer(balanceEmptyMessage(s))] };
  }
  return { text: [balanceContainer(content)] };
}

// First paint: pairing if we have no device token yet, else Balance.
// Dev mode skips pairing outright — fixtures need no token, so go to Balance.
const haveToken = DEV_MODE || !!getDeviceToken();
state = navigate(state, haveToken ? "balance" : "pairing");
const result = await createPage(buildContainers(state));
console.log("Page created:", result === 0 ? "success" : `failed(${result})`);

function render(_prevScreen?: Screen): void {
  rebuild(buildContainers(state));
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// A 401 from either fetch means the device token is gone — re-pair once.
let repairing = false;
async function handleUnauthorized(): Promise<void> {
  if (repairing) return;
  repairing = true;
  try {
    await beginPairing();
  } finally {
    repairing = false;
  }
}

// Balances and transactions refresh INDEPENDENTLY so a slow/empty transaction
// sync never blanks balances the user already has (the old coupled Promise.all
// failed the whole screen on either error).
async function refreshBalances(): Promise<void> {
  const prev = state.screen;
  try {
    const items = await getLinkedItems();
    state = withLinkedItems(state, items);
    render(prev);
  } catch (err) {
    if (err instanceof UnauthorizedError) return void handleUnauthorized();
    console.error("balances refresh failed:", err);
    state = withAccountsPhase(state, "offline");
    render(prev);
  }
}

async function refreshTransactions(): Promise<void> {
  const prev = state.screen;
  try {
    const transactions = await getTransactions();
    state = withTransactions(state, transactions);
    render(prev);
  } catch (err) {
    if (err instanceof UnauthorizedError) return void handleUnauthorized();
    console.error("transactions refresh failed:", err);
    state = withTransactionsPhase(state, "offline");
    render(prev);
  }
}

async function refreshRecurring(): Promise<void> {
  const prev = state.screen;
  try {
    const streams = await getRecurring();
    state = withRecurring(state, streams);
    render(prev);
  } catch (err) {
    if (err instanceof UnauthorizedError) return void handleUnauthorized();
    console.error("recurring refresh failed:", err);
    state = withRecurringPhase(state, "offline");
    render(prev);
  }
}

async function refresh(): Promise<void> {
  await Promise.all([refreshBalances(), refreshTransactions(), refreshRecurring()]);
}

// Right after pairing the Plaid item is still settling, so poll a few times
// quickly until balances arrive instead of waiting a full refresh interval.
async function refreshAfterPairing(): Promise<void> {
  for (let i = 0; i < POST_PAIR_RETRIES; i++) {
    await refresh();
    if (state.accounts.length > 0 || state.screen === "pairing") return;
    await delay(POST_PAIR_RETRY_MS);
  }
}

async function beginPairing(): Promise<void> {
  await clearDeviceToken(bridge);
  pairingStart = null;
  pairingMessage = "Starting…";
  state = navigate(state, "pairing");
  rebuild(buildContainers(state));
  try {
    pairingStart = await startPairing();
    pairingMessage = null;
    rebuild(buildContainers(state)); // show the user code
    phoneOnboarding(pairingStart); // show matching instructions on the phone
    const token = await pollForToken(pairingStart);
    await persistDeviceToken(bridge, token);
    pairingStart = null;
    // Fresh pairing: no data yet, so show the connecting state, then poll until
    // balances arrive.
    state = withRecurringPhase(
      withTransactionsPhase(
        withAccountsPhase(navigate(state, "balance"), "loading"),
        "loading",
      ),
      "loading",
    );
    rebuild(buildContainers(state));
    void phoneLinked(); // switch the phone UI to the accounts dashboard
    await refreshAfterPairing();
  } catch (err) {
    console.error("pairing failed:", err);
    pairingMessage = "Pairing failed. Double-tap to exit, then reopen.";
    rebuild(buildContainers(state));
  }
}

// Re-render the glasses whenever the phone UI toggles account visibility.
setOnHiddenChange(() => render());

// Kick off.
if (haveToken) {
  void refresh();
  void phoneLinked(); // already paired — show the accounts dashboard on the phone
} else {
  void beginPairing();
}

function go(screen: Screen): void {
  const prev = state.screen;
  state = navigate(state, screen);
  render(prev);
}

const unsubscribe = bridge.onEvenHubEvent((event) => {
  // During pairing, only allow exit.
  if (state.screen === "pairing") {
    if (
      event.sysEvent &&
      (event.sysEvent.eventType ?? 0) === OsEventTypeList.DOUBLE_CLICK_EVENT
    ) {
      void bridge.shutDownPageContainer(1);
    }
    return;
  }

  if (event.listEvent) {
    // Balance screen has no nav list; list events only come from transaction lists.
    if (state.screen === "balance") return;
    const index = event.listEvent.currentSelectItemIndex ?? 0;
    const prev = state.screen;
    state = selectTransaction(state, index);
    render(prev);
    return;
  }

  // Event type can arrive via sysEvent (CLICK/DOUBLE_CLICK/lifecycle on any
  // screen) OR via textEvent — scroll on a text container (the balance screen)
  // is delivered as a textEvent, not a sysEvent.
  const type = event.sysEvent?.eventType ?? event.textEvent?.eventType;
  if (type === undefined) return;

  // Balance screen pagination: SCROLL_TOP = previous page, SCROLL_BOTTOM = next.
  if (state.screen === "balance") {
    if (type === OsEventTypeList.SCROLL_TOP_EVENT && state.balancePage > 0) {
      state = withBalancePage(state, state.balancePage - 1);
      render("balance");
      return;
    }
    if (
      type === OsEventTypeList.SCROLL_BOTTOM_EVENT &&
      state.balancePage < balanceTotalPages(state) - 1
    ) {
      state = withBalancePage(state, state.balancePage + 1);
      render("balance");
      return;
    }
  }

  if (type === OsEventTypeList.CLICK_EVENT) {
    if (state.screen === "transactions") go("balance");
    else if (state.screen === "recurring") go("balance");
    return;
  }

  if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    if (state.screen === "detail") go(state.detailOrigin);
    else if (state.screen === "transactions") go("balance");
    else if (state.screen === "recurring") go("balance");
    else {
      void bridge.shutDownPageContainer(1);
    }
    return;
  }

  if (type === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
    void refresh();
    return;
  }

  if (
    type === OsEventTypeList.SYSTEM_EXIT_EVENT ||
    type === OsEventTypeList.ABNORMAL_EXIT_EVENT
  ) {
    unsubscribe();
  }
});
