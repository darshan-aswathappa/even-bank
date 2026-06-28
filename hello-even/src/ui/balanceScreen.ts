// Balance screen: single full-page TextContainerProperty with manual pagination.
// Using TextContainerProperty (no per-line byte limit) lets justify() place amounts
// at the true right edge (552 px) — impossible within list items' 63-byte limit.

import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import type { AppState } from "../state/store";
import { accountLabel, formatBalance } from "./format";
import { isHidden } from "../data/hiddenAccounts";
import { justify, measureHeight, hr } from "./fit";
import { MIDDOT, SCROLL_UP, SCROLL_DOWN } from "./glyphs";

export const BALANCE_ID = 1;
export const BALANCE_NAME = "balance";

const PAD = 12;
const FULL_W = 576;
const INNER_W = FULL_W - PAD * 2; // 552 px — content area width (wrap boundary)
const ROW_W = INNER_W - 6; // justify target: 6 px margin so amounts never touch
//                            the wrap boundary (a line at exactly INNER_W wraps)
const FULL_H = 288;
const AVAIL_H = FULL_H - PAD * 2; // 264 px available for content

// ─── Data helpers ─────────────────────────────────────────────────────────────

function buildRows(state: AppState): string[] {
  const rows: string[] = [];
  for (const item of state.linkedItems) {
    const visible = item.accounts.filter((a) => !isHidden(a.id));
    if (visible.length === 0) continue;

    // Blank line between bank groups for visual separation (not before the first).
    if (rows.length > 0) rows.push("");

    // Bank section header (all-caps institution name)
    const bankName = (item.institution ?? "Bank").toUpperCase();
    rows.push(bankName);

    // Account rows: name left, amount right — pixel-accurate
    for (const a of visible) {
      rows.push(
        justify(
          accountLabel(a.name, a.mask),
          formatBalance(a.available, a.currency),
          ROW_W,
        ),
      );
    }
  }
  return rows;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function buildPages(state: AppState): string[] {
  const allRows = buildRows(state);
  if (allRows.length === 0) return [];

  const n = state.linkedItems.filter(
    (it) => it.accounts.some((a) => !isHidden(a.id)),
  ).length;
  const header = n > 0
    ? `BALANCE  ${MIDDOT}  ${n} ${n === 1 ? "bank" : "banks"}`
    : "BALANCE";

  const pages: string[] = [];
  let lines: string[] = [header, hr(INNER_W)];
  let minLines = 2; // header + HR are always on the first page

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    const isLast = i === allRows.length - 1;

    // Probe: does adding this row (plus a ▼ if not last) overflow the page?
    const probe = isLast
      ? [...lines, row]
      : [...lines, row, SCROLL_DOWN];

    if (
      lines.length > minLines &&
      measureHeight(probe.join("\n"), INNER_W) > AVAIL_H
    ) {
      // Flush current page with a scroll-down affordance, start a new one.
      pages.push([...lines, SCROLL_DOWN].join("\n"));
      lines = [SCROLL_UP];
      minLines = 1;
      // Drop a blank spacer that would otherwise sit right under the ▲.
      if (row === "") continue;
    }

    lines.push(row);
  }

  pages.push(lines.join("\n"));
  return pages;
}

// No caching: account visibility (isHidden) can change without the AppState
// reference changing (the phone toggles it and calls render()), so pages must be
// rebuilt every call to stay in sync. buildPages is cheap.
export function balanceTotalPages(state: AppState): number {
  return Math.max(1, buildPages(state).length);
}

export function balanceContent(state: AppState): string {
  const pages = buildPages(state);
  if (pages.length === 0) return "";
  const page = Math.max(0, Math.min(state.balancePage, pages.length - 1));
  return pages[page] ?? "";
}

// ─── Container ────────────────────────────────────────────────────────────────

export function balanceContainer(content: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: FULL_W,
    height: FULL_H,
    borderWidth: 0,
    paddingLength: PAD,
    containerID: BALANCE_ID,
    containerName: BALANCE_NAME,
    isEventCapture: 1,
    content,
  });
}

// ─── Empty / loading / offline ────────────────────────────────────────────────

export function balanceEmptyMessage(state: AppState): string {
  if (state.accountsPhase === "loading") return "Connecting to your bank…";
  if (state.accountsPhase === "offline") return "Can't reach your bank.\nRetrying…";
  return "No accounts linked.\nRe-link in the Even Bank app.";
}

export function balanceEmptyContainer(message: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: FULL_W,
    height: FULL_H,
    borderWidth: 0,
    paddingLength: PAD,
    containerID: BALANCE_ID,
    containerName: BALANCE_NAME,
    isEventCapture: 1,
    content: `BALANCE\n\n${message}`,
  });
}
