// Balance overview. Two stacked text containers emulate a space-between
// layout (the firmware has no flexbox): a top, event-capturing container with
// the header, rule, and account rows; and a bottom container pinned to the
// foot of the canvas holding the gesture hint.

import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import type { AppState } from "../state/store";
import { accountLabel, formatBalance, relativeTime } from "./format";
import { justify, hr, measureHeight } from "./fit";
import { CHEVRON } from "./glyphs";

export const BALANCE_ID = 1;
export const BALANCE_NAME = "balance";
// Container IDs must be contiguous (1..N) — the firmware rejects gaps.
export const BALANCE_HINT_ID = 2;
export const BALANCE_HINT_NAME = "balanceHint";

const PAD = 12;
const INNER_W = 576 - 2 * PAD; // 552 — true text-wrap width (no border)
// Justify target for two-column rows. Sits a few px inside INNER_W so the
// rounded inter-column gap never tips the right-aligned value past the wrap
// edge (which would spill the cents onto a second line).
const ROW_W = INNER_W - 6;

// One rendered line of hint text, used to size and position the bottom strip so
// its baseline sits a symmetric PAD above the bottom edge.
const LINE_H = measureHeight("transactions", INNER_W);
const HINT_H = 2 * PAD + LINE_H;
const HINT_Y = 288 - HINT_H;
// Vertical space the top container can fill before it would collide with the
// pinned hint strip (top padding to the top of the hint strip).
const TOP_AVAIL = HINT_Y - PAD;

export function balanceContainer(content: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 0,
    paddingLength: PAD,
    containerID: BALANCE_ID,
    containerName: BALANCE_NAME,
    isEventCapture: 1,
    content,
  });
}

export function balanceHintContainer(content: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: HINT_Y,
    width: 576,
    height: HINT_H,
    borderWidth: 0,
    paddingLength: PAD,
    containerID: BALANCE_HINT_ID,
    containerName: BALANCE_HINT_NAME,
    isEventCapture: 0,
    content,
  });
}

// The bottom hint: full navigation when accounts are present, exit-only
// otherwise (nothing to drill into yet).
export function balanceHint(state: AppState): string {
  return state.accounts.length > 0
    ? `${CHEVRON} transactions     ${CHEVRON}${CHEVRON} exit`
    : `${CHEVRON}${CHEVRON} exit`;
}

export function balanceContent(state: AppState): string {
  const rule = hr(INNER_W);

  // No accounts to show yet — pick a state-appropriate message rather than a
  // bare "NO ACCOUNTS".
  if (state.accounts.length === 0) {
    if (state.accountsPhase === "loading") {
      return ["BALANCE", rule, "", "Connecting to your bank…"].join("\n");
    }
    if (state.accountsPhase === "offline") {
      return ["BALANCE", rule, "", "Can't reach your bank.", "Retrying…"].join("\n");
    }
    // Loaded successfully but the bank reported no accounts (rare edge case).
    return [
      "BALANCE",
      rule,
      "",
      "No accounts linked.",
      "Re-link in the Even Bank app.",
    ].join("\n");
  }

  // Have accounts — show them, flagging the last sync as stale when offline.
  const updated =
    state.accountsPhase === "offline"
      ? `offline · ${relativeTime(state.lastUpdated)}`.trim()
      : relativeTime(state.lastUpdated);

  const header = justify("BALANCE", updated, ROW_W);

  const rows = state.accounts.map((a) =>
    justify(
      accountLabel(a.name, a.mask),
      formatBalance(a.available, a.currency),
      ROW_W,
    ),
  );

  // Add account rows while the top content still fits above the pinned hint.
  // When some rows don't fit, a "+N more" line replaces the overflow.
  const shown: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const trial = [...shown, rows[i]];
    const hidden = rows.length - trial.length;
    const tail = hidden > 0 ? [`+${hidden} more`] : [];
    const content = [header, rule, ...trial, ...tail].join("\n");
    if (measureHeight(content, INNER_W) > TOP_AVAIL) break;
    shown.push(rows[i]);
  }

  const hidden = rows.length - shown.length;
  const tail = hidden > 0 ? [`+${hidden} more`] : [];
  return [header, rule, ...shown, ...tail].join("\n");
}
