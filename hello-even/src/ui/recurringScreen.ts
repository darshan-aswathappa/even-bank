// Recurring charges screen: a title bar + a native-scroll list of outflow
// streams. Mirrors transactionsScreen.ts layout and constraints exactly.

import {
  TextContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
} from "@evenrealities/even_hub_sdk";
import type { AppState } from "../state/store";
import { formatAmount, formatFrequency } from "./format";
import { clampBytes, byteLength, truncate, textWidth } from "./fit";
import { CHEVRON, MIDDOT } from "./glyphs";

export const REC_TITLE_ID = 1;
export const REC_TITLE_NAME = "rectitle";
export const REC_LIST_ID = 2;
export const REC_LIST_NAME = "reclist";

const TITLE_H = 40;
const ITEM_MAX_BYTES = 62;
const ROW_MAX_PX = 552;

export function recurringTitleContainer(content: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: TITLE_H,
    borderWidth: 1,
    borderColor: 9,
    borderRadius: 2,
    paddingLength: 8,
    containerID: REC_TITLE_ID,
    containerName: REC_TITLE_NAME,
    isEventCapture: 0,
    content,
  });
}

export function recurringTitle(state: AppState): string {
  return `RECURRING  ${MIDDOT}  ${state.recurringStreams.length}`;
}

// Each row: "Merchant  -$15.49/mo" — name truncated to pixel budget, amount+freq right-aligned.
export function recurringRows(state: AppState): string[] {
  return state.recurringStreams.map((s) => {
    const suffix = `  ${formatAmount(s.amount, s.currency)}${formatFrequency(s.frequency)}`;
    const namePx = Math.max(0, ROW_MAX_PX - textWidth(suffix));
    const nameBytes = Math.max(4, ITEM_MAX_BYTES - byteLength(suffix));
    const name = clampBytes(truncate(s.name, namePx), nameBytes);
    return `${name}${suffix}`;
  });
}

export function recurringListContainer(items: string[]): ListContainerProperty {
  return new ListContainerProperty({
    xPosition: 0,
    yPosition: TITLE_H + 4,
    width: 576,
    height: 288 - TITLE_H - 4,
    borderWidth: 1,
    borderColor: 6,
    borderRadius: 2,
    paddingLength: 0,
    containerID: REC_LIST_ID,
    containerName: REC_LIST_NAME,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: items.length,
      itemWidth: 0,
      isItemSelectBorderEn: 1,
      itemName: items,
    }),
  });
}

export function recurringEmptyMessage(state: AppState): string {
  if (state.recurringPhase === "loading") return "Loading recurring charges…";
  if (state.recurringPhase === "offline") {
    return "Can't load recurring charges.\nRetrying…";
  }
  return "No recurring charges found.\nCheck back after more transactions.";
}

export function recurringEmptyContainer(message: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 1,
    borderColor: 7,
    borderRadius: 2,
    paddingLength: 12,
    containerID: REC_TITLE_ID,
    containerName: "recempty",
    isEventCapture: 1,
    content: `RECURRING\n\n${message}\n\n${CHEVRON}${CHEVRON} back`,
  });
}
