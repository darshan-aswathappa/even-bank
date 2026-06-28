// Stateless JWT auth for the "add another bank" browser flow. A device-token
// holder (the phone WebView) calls POST /manage/link/start to get a short-lived
// signed URL they open in a real browser, which then presents this token for
// /api/link/add/* calls. Audience "add-bank" prevents reuse with device/claim
// tokens even if the same key material is shared.
//
// jose is ESM-only; load it dynamically from this CommonJS module (same pattern
// as routes/webhook.ts).

import type { Request, Response, NextFunction } from "express";
import { config } from "../config";

function signingKey(): Uint8Array {
  return new TextEncoder().encode(config.kekBase64 + ":add-bank");
}

export async function signAddBankToken(userId: string): Promise<string> {
  const { SignJWT } = await import("jose");
  return new SignJWT()
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience("add-bank")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingKey());
}

export async function requireAddBankToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const raw: unknown = req.body?.token;
  if (typeof raw !== "string" || !raw) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  try {
    const { jwtVerify } = await import("jose");
    const { payload } = await jwtVerify(raw, signingKey(), { audience: "add-bank" });
    if (typeof payload.sub !== "string") {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "unauthenticated" });
  }
}
