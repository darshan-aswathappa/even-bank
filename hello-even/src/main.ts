import { waitForEvenAppBridge, OsEventTypeList } from "@evenrealities/even_hub_sdk";
import { REFRESH_MS } from "./config";
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
  withData,
  withStatus,
  navigate,
  selectTransaction,
  selectedTransaction,
  toCache,
  fromCache,
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
  BALANCE_ID,
  BALANCE_NAME,
} from "./ui/balanceScreen";
import {
  txnTitleContainer,
  txnTitle,
  txnRows,
  txnListContainer,
  txnEmptyContainer,
} from "./ui/transactionsScreen";
import { detailContainer, detailContent } from "./ui/detailScreen";
import { pairingContainer, pairingContent, pairingStatus } from "./ui/pairingScreen";

const CACHE_KEY = "evenbank.cache";

const bridge = await waitForEvenAppBridge();
initRender(bridge);

let state: AppState = initialState;
let pairingStart: PairingStart | null = null;
let pairingMessage: string | null = null;

await loadDeviceToken(bridge);

// Seed from cache for an instant first paint.
try {
  const cached = fromCache(await bridge.getLocalStorage(CACHE_KEY));
  if (cached) {
    state = withData(state, cached.accounts, cached.transactions, cached.lastUpdated);
  }
} catch (err) {
  console.error("cache load failed:", err);
}

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
    if (s.transactions.length === 0) return { text: [txnEmptyContainer()] };
    return {
      text: [txnTitleContainer(txnTitle(s))],
      list: [txnListContainer(txnRows(s))],
    };
  }
  if (s.screen === "detail") {
    return { text: [detailContainer(detailContent(selectedTransaction(s)))] };
  }
  return { text: [balanceContainer(balanceContent(s))] };
}

// First paint: pairing if we have no device token yet, else Balance.
const haveToken = !!getDeviceToken();
state = navigate(state, haveToken ? "balance" : "pairing");
const result = await createPage(buildContainers(state));
console.log("Page created:", result === 0 ? "success" : `failed(${result})`);

function render(prevScreen?: Screen): void {
  if (state.screen === "balance" && prevScreen === "balance") {
    upgradeText(BALANCE_ID, BALANCE_NAME, balanceContent(state));
  } else {
    rebuild(buildContainers(state));
  }
}

async function refresh(): Promise<void> {
  const prev = state.screen;
  try {
    const [accounts, transactions] = await Promise.all([
      getBalances(),
      getTransactions(),
    ]);
    state = withData(state, accounts, transactions, Date.now());
    void bridge.setLocalStorage(CACHE_KEY, JSON.stringify(toCache(state)));
    render(prev);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      await beginPairing(); // token missing/expired/revoked -> re-pair
      return;
    }
    console.error("refresh failed:", err);
    state = withStatus(state, "offline");
    render(prev);
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
    state = withStatus(navigate(state, "balance"), "loading");
    rebuild(buildContainers(state));
    await refresh();
  } catch (err) {
    console.error("pairing failed:", err);
    pairingMessage = "Pairing failed. Double-tap to exit, then reopen.";
    rebuild(buildContainers(state));
  }
}

// Kick off.
if (haveToken) void refresh();
else void beginPairing();

const refreshTimer = setInterval(() => {
  if (state.screen !== "pairing") void refresh();
}, REFRESH_MS);

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
      clearInterval(refreshTimer);
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
      clearInterval(refreshTimer);
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
    clearInterval(refreshTimer);
    unsubscribe();
  }
});
