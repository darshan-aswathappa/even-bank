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
import { clampBytes, byteLength, truncate, textWidth } from "./fit";
import { CHEVRON, MIDDOT } from "./glyphs";

export const TXN_TITLE_ID = 1;
export const TXN_TITLE_NAME = "txntitle";
export const TXN_LIST_ID = 2;
export const TXN_LIST_NAME = "txnlist";

const TITLE_H = 40;
const ITEM_MAX_BYTES = 62;
const ROW_MAX_PX = 552;
const MAX_ROWS = 20;
const ITEM_H = 40; // matches SDK item height (balanceScreen: 80px / 2 items)
const MAX_VISIBLE = 6; // items shown before list scrolls

export function txnTitleContainer(content: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: TITLE_H,
    borderWidth: 0,
    borderRadius: 2,
    paddingLength: 8,
    containerID: TXN_TITLE_ID,
    containerName: TXN_TITLE_NAME,
    isEventCapture: 0,
    content,
  });
}

export function txnTitle(state: AppState): string {
  const total = state.transactions.length;
  const shown = Math.min(total, MAX_ROWS);
  const suffix = total > MAX_ROWS ? ` of ${total}` : "";
  return `TRANSACTIONS  ${MIDDOT}  ${shown}${suffix}`;
}

// Returns up to MAX_ROWS transactions sorted most-recent-first. Pending
// transactions sort before settled ones on the same date so the list aligns
// with the current balance (which includes pending charges).
function sortedTxns(state: AppState) {
  return [...state.transactions]
    .sort((a, b) => {
      if (b.isoDate !== a.isoDate) return b.isoDate.localeCompare(a.isoDate);
      if (a.pending !== b.pending) return a.pending ? -1 : 1;
      return 0;
    })
    .slice(0, MAX_ROWS);
}

// Compact, left-aligned list rows: "[~]Merchant  -$5.40". Pending rows are
// prefixed with ~ so they're visually distinct and match the current balance.
// The name is truncated to fit the row's pixel width (the font is not
// monospaced, so byte count alone lets long descriptions spill past the edge)
// while the amount is always kept. A byte clamp guards the firmware's hard
// 63-byte list-item limit.
export function txnRows(state: AppState): string[] {
  return sortedTxns(state).map((t) => {
    const prefix = t.pending ? "~" : "";
    const suffix = `  ${formatAmount(t.amount, null)}`;
    const namePx = Math.max(
      0,
      ROW_MAX_PX - textWidth(prefix) - textWidth(suffix),
    );
    const nameBytes = Math.max(
      4,
      ITEM_MAX_BYTES - byteLength(prefix) - byteLength(suffix),
    );
    const name = clampBytes(truncate(t.merchant ?? t.name, namePx), nameBytes);
    return `${prefix}${name}${suffix}`;
  });
}

export function txnListContainer(items: string[]): ListContainerProperty {
  const height = Math.min(items.length, MAX_VISIBLE) * ITEM_H;
  return new ListContainerProperty({
    xPosition: 0,
    yPosition: TITLE_H + 4,
    width: 576,
    height,
    borderWidth: 0,
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
    content: `TRANSACTIONS\n\n${message}\n\n${CHEVRON}${CHEVRON} back`,
  });
}
