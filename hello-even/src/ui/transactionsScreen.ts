// Transactions screen: a title bar (no event capture) + a native-scroll list
// container (event capture) whose items are the transaction rows. When there
// are no transactions, an empty-state text container is shown instead (a list
// must have 1-20 items).

import {
  TextContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
} from "@evenrealities/even_hub_sdk";
import type { AppState } from "../state/store";
import { formatAmount } from "./format";
import { clampBytes, byteLength } from "./fit";
import { DOT, MIDDOT } from "./glyphs";

export const TXN_TITLE_ID = 1;
export const TXN_TITLE_NAME = "txntitle";
export const TXN_LIST_ID = 2;
export const TXN_LIST_NAME = "txnlist";

const TITLE_H = 40;
// Firmware caps each list item at 63 bytes; keep one byte of headroom.
const ITEM_MAX_BYTES = 62;

export function txnTitleContainer(content: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: TITLE_H,
    borderWidth: 1,
    borderColor: 9,
    borderRadius: 2,
    paddingLength: 8,
    containerID: TXN_TITLE_ID,
    containerName: TXN_TITLE_NAME,
    isEventCapture: 0,
    content,
  });
}

export function txnTitle(state: AppState): string {
  return `TRANSACTIONS  ${MIDDOT}  ${state.transactions.length}`;
}

// Compact, left-aligned list rows: "Merchant  -$5.40". Names are truncated so
// the whole row stays within the 63-byte list-item limit; the amount is always kept.
export function txnRows(state: AppState): string[] {
  return state.transactions.map((t) => {
    const suffix = `  ${formatAmount(t.amount, null)}`;
    const nameBudget = Math.max(4, ITEM_MAX_BYTES - byteLength(suffix));
    const name = clampBytes(t.merchant ?? t.name, nameBudget);
    return `${name}${suffix}`;
  });
}

export function txnListContainer(items: string[]): ListContainerProperty {
  return new ListContainerProperty({
    xPosition: 0,
    yPosition: TITLE_H + 4,
    width: 576,
    height: 288 - TITLE_H - 4,
    borderWidth: 1,
    borderColor: 6,
    borderRadius: 2,
    paddingLength: 0,
    containerID: TXN_LIST_ID,
    containerName: TXN_LIST_NAME,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: items.length,
      itemWidth: 0, // auto-fill container width
      isItemSelectBorderEn: 1,
      itemName: items,
    }),
  });
}

// State-appropriate message for the empty/loading/offline transactions view.
export function txnEmptyMessage(state: AppState): string {
  if (state.txnsPhase === "loading") return "Loading transactions…";
  if (state.txnsPhase === "offline") {
    return "Can't load transactions.\nRetrying…";
  }
  return "No transactions yet.\nThey'll appear here soon.";
}

// Shown when there are no transaction rows — an event-capturing text container
// so double-tap (back) still works.
export function txnEmptyContainer(message: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 1,
    borderColor: 7,
    borderRadius: 2,
    paddingLength: 12,
    containerID: TXN_TITLE_ID,
    containerName: "txnempty",
    isEventCapture: 1,
    content: `TRANSACTIONS\n\n${message}\n\n${DOT}${DOT} back`,
  });
}
