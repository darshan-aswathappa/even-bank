import { waitForEvenAppBridge, OsEventTypeList } from "@evenrealities/even_hub_sdk";
import { POST_PAIR_RETRIES, POST_PAIR_RETRY_MS, DEV_MODE } from "./config";
import { getBalances, getTransactions, UnauthorizedError } from "./data/bankApi";
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
  withAccounts,
  withTransactions,
  withAccountsPhase,
  withTransactionsPhase,
  navigate,
  selectTransaction,
  selectedTransaction,
} from "./state/store";
import {
  initRender,
  createPage,
  rebuild,
  upgradeText,
  type PageContainers,
} from "./bridge/render";
import {
  balanceContainer,
  balanceContent,
  balanceHintContainer,
  balanceHint,
  BALANCE_ID,
  BALANCE_NAME,
  BALANCE_HINT_ID,
  BALANCE_HINT_NAME,
} from "./ui/balanceScreen";
import {
  txnTitleContainer,
  txnTitle,
  txnRows,
  txnListContainer,
  txnEmptyContainer,
  txnEmptyMessage,
} from "./ui/transactionsScreen";
import { detailContainer, detailContent } from "./ui/detailScreen";
import { pairingContainer, pairingContent, pairingStatus } from "./ui/pairingScreen";

const bridge = await waitForEvenAppBridge();
initRender(bridge);

let state: AppState = initialState;
let pairingStart: PairingStart | null = null;
let pairingMessage: string | null = null;

await loadDeviceToken(bridge);

// No persistence cache: bank data is never seeded from storage. The app opens
// in its "loading" state and shows balances only once the first live fetch returns.

function buildContainers(s: AppState): PageContainers {
  if (s.screen === "pairing") {
    const content = pairingMessage
      ? pairingStatus(pairingMessage)
      : pairingStart
        ? pairingContent(pairingStart)
        : pairingStatus("Starting…");
    return { text: [pairingContainer(content)] };
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
  return {
    text: [
      balanceContainer(balanceContent(s)),
      balanceHintContainer(balanceHint(s)),
    ],
  };
}

// First paint: pairing if we have no device token yet, else Balance.
// Dev mode skips pairing outright — fixtures need no token, so go to Balance.
const haveToken = DEV_MODE || !!getDeviceToken();
state = navigate(state, haveToken ? "balance" : "pairing");
const result = await createPage(buildContainers(state));
console.log("Page created:", result === 0 ? "success" : `failed(${result})`);

function render(prevScreen?: Screen): void {
  if (state.screen === "balance" && prevScreen === "balance") {
    upgradeText(BALANCE_ID, BALANCE_NAME, balanceContent(state));
    upgradeText(BALANCE_HINT_ID, BALANCE_HINT_NAME, balanceHint(state));
  } else {
    rebuild(buildContainers(state));
  }
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
    const accounts = await getBalances();
    state = withAccounts(state, accounts);
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

async function refresh(): Promise<void> {
  await Promise.all([refreshBalances(), refreshTransactions()]);
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
    const token = await pollForToken(pairingStart);
    await persistDeviceToken(bridge, token);
    pairingStart = null;
    // Fresh pairing: no data yet, so show the connecting state, then poll until
    // balances arrive.
    state = withTransactionsPhase(
      withAccountsPhase(navigate(state, "balance"), "loading"),
      "loading",
    );
    rebuild(buildContainers(state));
    await refreshAfterPairing();
  } catch (err) {
    console.error("pairing failed:", err);
    pairingMessage = "Pairing failed. Double-tap to exit, then reopen.";
    rebuild(buildContainers(state));
  }
}

// Kick off.
if (haveToken) void refresh();
else void beginPairing();

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
    const index = event.listEvent.currentSelectItemIndex ?? 0;
    const prev = state.screen;
    state = selectTransaction(state, index);
    render(prev);
    return;
  }

  if (!event.sysEvent) return;
  const type = event.sysEvent.eventType ?? 0;

  if (type === OsEventTypeList.CLICK_EVENT) {
    if (state.screen === "balance") go("transactions");
    else if (state.screen === "transactions") go("balance");
    return;
  }

  if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    if (state.screen === "detail") go("transactions");
    else if (state.screen === "transactions") go("balance");
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
