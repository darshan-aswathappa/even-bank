// Balance overview. A top text container shows the header and account rows;
// a bottom native list lets the user select TRANSACTIONS or RECURRING to navigate.

import {
  TextContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
} from "@evenrealities/even_hub_sdk";
import type { AppState } from "../state/store";
import { accountLabel, formatBalance } from "./format";
import { justify, hr, measureHeight } from "./fit";

export const BALANCE_ID = 1;
export const BALANCE_NAME = "balance";
// Container IDs must be contiguous (1..N) — the firmware rejects gaps.
export const BALANCE_NAV_ID = 2;
export const BALANCE_NAV_NAME = "balancenav";

const PAD = 12;
const INNER_W = 576 - 2 * PAD; // 552 — true text-wrap width (no border)
// Justify target for two-column rows.
const ROW_W = INNER_W - 6;

// Height reserved for the 2-item navigation list at the bottom.
const NAV_H = 80;
const NAV_Y = 288 - NAV_H; // 208
// Vertical space the top container can fill before it would collide with the nav list.
const TOP_AVAIL = NAV_Y - PAD; // 196

export function balanceContainer(content: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: NAV_Y,
    borderWidth: 0,
    paddingLength: PAD,
    containerID: BALANCE_ID,
    containerName: BALANCE_NAME,
    isEventCapture: 0,
    content,
  });
}

// Static 2-item list: TRANSACTIONS and RECURRING. Items never change so this
// container never needs to be upgraded — only rebuilt on screen transitions.
export function balanceNavList(): ListContainerProperty {
  return new ListContainerProperty({
    xPosition: 0,
    yPosition: NAV_Y,
    width: 576,
    height: NAV_H,
    borderWidth: 0,
    paddingLength: 0,
    containerID: BALANCE_NAV_ID,
    containerName: BALANCE_NAV_NAME,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: 2,
      itemWidth: 0,
      isItemSelectBorderEn: 1,
      itemName: ["TRANSACTIONS", "RECURRING"],
    }),
  });
}

export function balanceContent(state: AppState): string {
  const rule = hr(INNER_W);

  if (state.accounts.length === 0) {
    if (state.accountsPhase === "loading") {
      return ["BALANCE", rule, "", "Connecting to your bank…"].join("\n");
    }
    if (state.accountsPhase === "offline") {
      return ["BALANCE", rule, "", "Can't reach your bank.", "Retrying…"].join("\n");
    }
    return [
      "BALANCE",
      rule,
      "",
      "No accounts linked.",
      "Re-link in the Even Bank app.",
    ].join("\n");
  }

  const header = "BALANCE";

  const rows = state.accounts.map((a) =>
    justify(
      accountLabel(a.name, a.mask),
      formatBalance(a.available, a.currency),
      ROW_W,
    ),
  );

  // Add account rows while the top content still fits above the nav list.
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
