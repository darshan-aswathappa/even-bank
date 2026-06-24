// Pixel-accurate text fitting using @evenrealities/pretext, which measures with
// the same LVGL glyph advances the firmware uses. The firmware font is NOT
// monospaced, so we measure rather than count characters.

import { getTextWidth, pxTruncate } from "@evenrealities/pretext";

const SPACE_W = getTextWidth(" ") || 5;
const HR_W = getTextWidth("─") || 8;

export function truncate(text: string, maxPx: number): string {
  return pxTruncate(text, maxPx);
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
  const spaces = Math.max(1, Math.round(gapPx / SPACE_W));
  return `${leftFit}${" ".repeat(spaces)}${right}`;
}
