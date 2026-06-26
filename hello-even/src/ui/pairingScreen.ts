// Pairing screen: instructs the wearer to open the onboarding page on their
// phone and type the user code shown here. A single full-screen, event-capturing
// text container (double-tap exits).

import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import { CHEVRON } from "./glyphs";

export const PAIRING_ID = 1;
export const PAIRING_NAME = "pairing";

export function pairingContainer(content: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 1,
    borderColor: 7,
    borderRadius: 2,
    paddingLength: 12,
    containerID: PAIRING_ID,
    containerName: PAIRING_NAME,
    isEventCapture: 1,
    content,
  });
}

// Once pairing has started, the phone's onboarding page owns the code and the
// step-by-step instructions. The glasses just wait for the wearer to finish.
export function pairingContent(): string {
  return [
    "EVEN BANK",
    "",
    "Waiting for you to finish linking…",
    "",
    `${CHEVRON}${CHEVRON} exit`,
  ].join("\n");
}

export function pairingStatus(message: string): string {
  return ["PAIR YOUR GLASSES", "", message, "", `${CHEVRON}${CHEVRON} exit`].join("\n");
}
