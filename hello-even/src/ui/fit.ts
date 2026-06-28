// Pixel-accurate text fitting using @evenrealities/pretext, which measures with
// the same LVGL glyph advances the firmware uses. The firmware font is NOT
// monospaced, so we measure rather than count characters.

import { getTextWidth, pxTruncate, measureTextWrap } from "@evenrealities/pretext";

const SPACE_W = getTextWidth(" ") || 5;
const HR_W = getTextWidth("─") || 8;

export function truncate(text: string, maxPx: number): string {
  return pxTruncate(text, maxPx);
}

// Rendered pixel width of a string in the firmware font (non-monospaced).
export function textWidth(text: string): number {
  return getTextWidth(text);
}

// Clamp a string to a UTF-8 byte budget (list items are capped at 63 bytes by
// the firmware). Trims whole characters so we never split a multibyte glyph.
const encoder = new TextEncoder();
export function clampBytes(text: string, maxBytes: number): string {
  if (encoder.encode(text).length <= maxBytes) return text;
  let out = text;
  while (out.length > 0 && encoder.encode(out).length > maxBytes) {
    out = out.slice(0, -1);
  }
  return out;
}

export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

// Horizontal rule that fills the given inner width.
export function hr(innerWidth: number): string {
  const n = Math.max(1, Math.floor(innerWidth / HR_W));
  return "─".repeat(n);
}

// Rendered pixel height of wrapped text at a given inner width, using the same
// per-glyph LVGL line-breaking the firmware uses. Used to guard against
// vertical overflow on multi-line screens.
export function measureHeight(text: string, innerWidth: number): number {
  return measureTextWrap(text, innerWidth).height;
}

// Left-align `left`, right-align `right` on a single line by padding the gap
// with spaces. Truncates `left` if the pair can't fit. Approximate (space width
// is fixed) but visually correct on this display.
export function justify(
  left: string,
  right: string,
  innerWidth: number,
  gapMinPx = 12,
): string {
  const rightW = getTextWidth(right);
  const maxLeftPx = innerWidth - rightW - gapMinPx;
  const leftFit = maxLeftPx > 0 ? pxTruncate(left, maxLeftPx) : "";
  const gapPx = Math.max(gapMinPx, innerWidth - getTextWidth(leftFit) - rightW);
  // Floor (not round) so leftW + spaces*SPACE_W + rightW never exceeds innerWidth.
  // Rounding up overshoots the content width by a few px and forces the line to
  // wrap (e.g. "$6,009." / "00"); flooring keeps the amount on one line.
  const spaces = Math.max(1, Math.floor(gapPx / SPACE_W));
  return `${leftFit}${" ".repeat(spaces)}${right}`;
}

// justify() variant for list items: same pixel-accurate right-alignment but
// guarantees the result fits within `maxBytes`. The spaces budget is capped so
// the right side (amount) is never truncated by the firmware's 63-byte limit.
export function justifyItem(
  left: string,
  right: string,
  innerWidth: number,
  maxBytes: number,
  gapMinPx = 12,
): string {
  const rightB = byteLength(right);
  const rightW = getTextWidth(right);
  const leftPxMax = Math.max(0, innerWidth - rightW - gapMinPx);
  const leftBMax = Math.max(0, maxBytes - rightB - 1); // 1 space minimum
  const leftFit = clampBytes(pxTruncate(left, leftPxMax), leftBMax);
  const gapPx = Math.max(gapMinPx, innerWidth - getTextWidth(leftFit) - rightW);
  const spacesIdeal = Math.max(1, Math.round(gapPx / SPACE_W));
  const spacesBudget = Math.max(1, maxBytes - byteLength(leftFit) - rightB);
  const spaces = Math.min(spacesIdeal, spacesBudget);
  return `${leftFit}${" ".repeat(spaces)}${right}`;
}
