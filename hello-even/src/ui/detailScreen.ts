// Transaction detail: a single full-screen, event-capturing text container.

import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import type { Transaction } from "../data/types";
import { formatAmount, formatDate } from "./format";
import { DOT } from "./glyphs";

export const DETAIL_ID = 1;
export const DETAIL_NAME = "detail";

export function detailContainer(content: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 1,
    borderColor: 7,
    borderRadius: 2,
    paddingLength: 12,
    containerID: DETAIL_ID,
    containerName: DETAIL_NAME,
    isEventCapture: 1,
    content,
  });
}

export function detailContent(t: Transaction | null): string {
  if (!t) return `TRANSACTION\n\nNothing selected.\n\n${DOT}${DOT} back`;

  const lines = [
    "TRANSACTION",
    "",
    t.merchant ?? t.name,
    formatAmount(t.amount, null),
    formatDate(t.isoDate),
  ];
  if (t.category) lines.push(t.category);
  lines.push(t.pending ? "PENDING" : "POSTED");
  lines.push("", `${DOT}${DOT} back`);
  return lines.join("\n");
}
