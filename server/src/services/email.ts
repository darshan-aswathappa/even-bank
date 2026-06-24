// Magic-link email. Uses Resend if RESEND_API_KEY is set; otherwise logs the
// link to the console (dev). No SDK dependency — just the Resend REST API.

import { config } from "../config";
import { logger } from "../logger";

export async function sendMagicLink(to: string, url: string): Promise<void> {
  if (!config.email.resendApiKey) {
    logger.info({ to, url }, "[email] DEV magic-link (no RESEND_API_KEY set)");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.email.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.email.from,
      to,
      subject: "Sign in to Even Bank",
      html: `<p>Tap to sign in and connect your bank:</p><p><a href="${url}">${url}</a></p><p>This link expires in 15 minutes.</p>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend failed: ${res.status} ${body}`);
  }
}
