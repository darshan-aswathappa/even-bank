// Balance screen: 40 px title bar (no event capture) + a native-scroll list of
// accounts grouped by institution. The list container is the only thing the
// firmware scrolls smoothly (item-by-item with a selection highlight), so we use
// it here. List items are byte-capped, so amounts are pushed as far right as the
// budget allows via justifyItem (they sit mid-row, not at the very edge — that
// far-right placement is only possible in a text container, which can't scroll).

import {
  TextContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
} from "@evenrealities/even_hub_sdk";
import type { AppState } from "../state/store";
import { accountLabel, formatBalance } from "./format";
import { isHidden } from "../data/hiddenAccounts";
import { clampBytes, truncate, justifyItem } from "./fit";
import { MIDDOT } from "./glyphs";

export const BAL_TITLE_ID = 1;
export const BAL_TITLE_NAME = "baltitle";
export const BAL_LIST_ID = 2;
export const BAL_LIST_NAME = "ballist";

const TITLE_H = 40;
const ITEM_H = 40;
const MAX_VISIBLE = 6; // viewport height in items; the rest scrolls natively
const MAX_ITEMS = 20; // firmware hard cap on list items
const ITEM_MAX_BYTES = 62; // firmware caps list items at ~63 bytes; stay under
const ROW_MAX_PX = 552;
const PAD = 8;
const INDENT = "  ";

// ─── Title bar ───────────────────────────────────────────────────────────────

export function balTitleContainer(content: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: TITLE_H,
    borderWidth: 0,
    paddingLength: PAD,
    containerID: BAL_TITLE_ID,
    containerName: BAL_TITLE_NAME,
    isEventCapture: 0,
    content,
  });
}

export function balTitle(state: AppState): string {
  const n = state.linkedItems.filter(
    (it) => it.accounts.some((a) => !isHidden(a.id)),
  ).length;
  if (n === 0) return "BALANCE";
  return `BALANCE  ${MIDDOT}  ${n} ${n === 1 ? "bank" : "banks"}`;
}

// ─── List items ──────────────────────────────────────────────────────────────

export function balItems(state: AppState): string[] {
  const items: string[] = [];

  for (const item of state.linkedItems) {
    const visible = item.accounts.filter((a) => !isHidden(a.id));
    if (visible.length === 0) continue;

    // Bank section header (all-caps institution name) — acts as the group divider.
    const bankName = (item.institution ?? "Bank").toUpperCase();
    items.push(clampBytes(truncate(bankName, ROW_MAX_PX), ITEM_MAX_BYTES));

    // Account rows: "  Name ····mask     $X,XXX.XX" — amount pushed right within
    // the byte budget (never truncated).
    for (const a of visible) {
      items.push(
        justifyItem(
          INDENT + accountLabel(a.name, a.mask),
          formatBalance(a.available, a.currency),
          ROW_MAX_PX,
          ITEM_MAX_BYTES,
        ),
      );
    }
  }

  return items.slice(0, MAX_ITEMS);
}

export function balListContainer(items: string[]): ListContainerProperty {
  const listH = Math.min(items.length, MAX_VISIBLE) * ITEM_H;
  return new ListContainerProperty({
    xPosition: 0,
    yPosition: TITLE_H + 4,
    width: 576,
    height: listH,
    borderWidth: 0,
    paddingLength: 0,
    containerID: BAL_LIST_ID,
    containerName: BAL_LIST_NAME,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: items.length,
      itemWidth: 0,
      isItemSelectBorderEn: 1,
      itemName: items,
    }),
  });
}

// ─── Empty / loading / offline ────────────────────────────────────────────────

export function balEmptyMessage(state: AppState): string {
  if (state.accountsPhase === "loading") return "Connecting to your bank…";
  if (state.accountsPhase === "offline") return "Can't reach your bank.\nRetrying…";
  return "No accounts linked.\nRe-link in the Even Bank app.";
}

// Full-screen text when there are no list items. Must have isEventCapture: 1 so
// double-tap shutdown still works with no list container present.
export function balEmptyContainer(message: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 0,
    paddingLength: PAD,
    containerID: BAL_TITLE_ID,
    containerName: "balempty",
    isEventCapture: 1,
    content: `BALANCE\n\n${message}`,
  });
}
