// Claim-token authentication for the PHONE onboarding flow. The phone receives
// a claim token when it claims the glasses' user_code (POST /api/device/claim);
// it then presents that token as `Authorization: Bearer cl_...` for the brief
// Plaid-linking window. FAIL-CLOSED: any missing, malformed, unknown, or expired
// token => 401. Replaces the old iron-session cookie.

import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { deviceAuth } from "../db/schema";
import { sha256 } from "../crypto/tokens";

export async function requireClaim(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const da = (
    await db
      .select()
      .from(deviceAuth)
      .where(eq(deviceAuth.claimTokenHash, sha256(token)))
      .limit(1)
  )[0];

  if (!da || !da.userId || da.expiresAt.getTime() < Date.now()) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  req.userId = da.userId;
  req.deviceAuthId = da.id;
  next();
}
