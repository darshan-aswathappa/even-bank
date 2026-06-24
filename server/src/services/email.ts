// Magic-link email. Uses Resend if RESEND_API_KEY is set; otherwise logs the
// link (dev). NEVER throws — if sending fails (e.g. unverified domain, bad key),
// it logs the error AND the link so sign-in is still recoverable from the logs
// and the request doesn't 500.

import { config } from "../config";
import { logger } from "../logger";

export async function sendMagicLink(to: string, url: string): Promise<void> {
  if (!config.email.resendApiKey) {
    logger.info({ to, url }, "[email] DEV magic-link (no RESEND_API_KEY set)");
    return;
  }

  try {
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
      const body = await res.text().catch(() => "");
      logger.error({ to, status: res.status, body }, "[email] Resend send failed");
      logger.info({ to, url }, "[email] magic-link (log fallback)");
    }
  } catch (err) {
    logger.error({ err: String(err) }, "[email] send threw");
    logger.info({ to, url }, "[email] magic-link (log fallback)");
  }
}
