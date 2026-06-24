// Magic-link email. Uses Resend if RESEND_API_KEY is set.
//
// SECURITY: the magic-link URL contains a sign-in token — logging it would let
// anyone with log access sign in. So the URL is ONLY ever logged in non-production
// (local dev convenience). In production, send failures throw and the route
// surfaces a clean error; the link never reaches a log sink.

import { config } from "../config";
import { logger } from "../logger";

const isProd = process.env.NODE_ENV === "production";

export async function sendMagicLink(to: string, url: string): Promise<void> {
  if (!config.email.resendApiKey) {
    if (isProd) {
      logger.error({ to }, "[email] RESEND_API_KEY not configured");
      throw new Error("email_not_configured");
    }
    logger.info({ to, url }, "[email] DEV magic-link (no RESEND_API_KEY)");
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
    const detail = await res.text().catch(() => "");
    // Log status/recipient for diagnosis; never the URL in production.
    logger.error(
      { to, status: res.status, detail: isProd ? undefined : detail },
      "[email] Resend send failed",
    );
    if (!isProd) logger.info({ to, url }, "[email] magic-link (dev fallback)");
    throw new Error("email_send_failed");
  }
}
