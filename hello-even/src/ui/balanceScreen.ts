// Balance overview: a single full-screen, event-capturing text container with
// a header line, a rule, one row per account, and a gesture hint.

import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import type { AppState } from "../state/store";
import { accountLabel, formatBalance, relativeTime } from "./format";
import { justify, hr } from "./fit";
import { DOT } from "./glyphs";

export const BALANCE_ID = 1;
export const BALANCE_NAME = "balance";

const PAD = 12;
const BORDER = 1;
const INNER_W = 576 - 2 * (PAD + BORDER); // 550

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

  const lines = [justify("BALANCE", updated, INNER_W), hr(INNER_W)];

  if (state.accounts.length === 0) {
    lines.push("", "NO ACCOUNTS");
  } else {
    for (const a of state.accounts) {
      lines.push(
        justify(
          accountLabel(a.name, a.mask),
          formatBalance(a.current, a.currency),
          INNER_W,
        ),
      );
    }
  }

  lines.push("", `${DOT} transactions     ${DOT}${DOT} exit`);
  return lines.join("\n");
}
