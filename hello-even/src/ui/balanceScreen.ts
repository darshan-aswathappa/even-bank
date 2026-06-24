// Balance overview: a single full-screen, event-capturing text container with
// a header line, a rule, one row per account, and a gesture hint.

import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import type { AppState } from "../state/store";
import { accountLabel, formatBalance, relativeTime } from "./format";
import { justify, hr, measureHeight } from "./fit";
import { DOT } from "./glyphs";

export const BALANCE_ID = 1;
export const BALANCE_NAME = "balance";

const PAD = 12;
const BORDER = 1;
const INNER_W = 576 - 2 * (PAD + BORDER); // 550
const INNER_H = 288 - 2 * (PAD + BORDER); // 262

export function balanceContainer(content: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: BORDER,
    borderColor: 7,
    borderRadius: 2,
    paddingLength: PAD,
    containerID: BALANCE_ID,
    containerName: BALANCE_NAME,
    isEventCapture: 1,
    content,
  });
}

export function balanceContent(state: AppState): string {
  if (state.status === "loading" && state.accounts.length === 0) {
    return "CONNECTING…";
  }

  const updated =
    state.status === "offline"
      ? `offline · ${relativeTime(state.lastUpdated)}`.trim()
      : relativeTime(state.lastUpdated);

  const header = justify("BALANCE", updated, INNER_W);
  const rule = hr(INNER_W);
  const hint = `${DOT} transactions     ${DOT}${DOT} exit`;

  if (state.accounts.length === 0) {
    return [header, rule, "", "NO ACCOUNTS", "", hint].join("\n");
  }

  const rows = state.accounts.map((a) =>
    justify(
      accountLabel(a.name, a.mask),
      formatBalance(a.current, a.currency),
      INNER_W,
    ),
  );

  // Add account rows while the whole screen still fits the 262px inner height.
  // When some rows don't fit, a "+N more" line replaces the overflow so the
  // gesture hint stays visible (the firmware doesn't scroll a text container).
  const shown: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const trial = [...shown, rows[i]];
    const hidden = rows.length - trial.length;
    const tail = hidden > 0 ? [`+${hidden} more`, "", hint] : ["", hint];
    const content = [header, rule, ...trial, ...tail].join("\n");
    if (measureHeight(content, INNER_W) > INNER_H) break;
    shown.push(rows[i]);
  }

  const hidden = rows.length - shown.length;
  const tail = hidden > 0 ? [`+${hidden} more`, "", hint] : ["", hint];
  return [header, rule, ...shown, ...tail].join("\n");
}
