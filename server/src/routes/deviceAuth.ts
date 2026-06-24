// RFC 8628-style device authorization for the glasses client.
//  POST /api/device/code  -> start pairing (returns user_code + device_code)
//  POST /api/device/token -> poll; once the phone has authorized + linked,
//                            mint the device token (returned once).

import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { deviceAuth, devices, users } from "../db/schema";
import {
  sha256,
  randomToken,
  deviceToken,
  generateUserCode,
  formatUserCode,
} from "../crypto/tokens";
import { config } from "../config";

export const deviceAuthRouter = Router();

const CODE_TTL_MS = 10 * 60 * 1000;
const POLL_INTERVAL_S = 5;

// POST /api/device/code
deviceAuthRouter.post("/device/code", async (_req, res) => {
  const code = randomToken(32); // secret device_code, glasses-held
  const userCode = generateUserCode(); // canonical, human-typed
  await db.insert(deviceAuth).values({
    deviceCodeHash: sha256(code),
    userCode,
    status: "pending",
    pollIntervalS: POLL_INTERVAL_S,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  res.json({
    device_code: code,
    user_code: formatUserCode(userCode),
    verification_uri: `${config.publicBaseUrl}/onboarding`,
    interval: POLL_INTERVAL_S,
    expires_in: CODE_TTL_MS / 1000,
  });
});

// POST /api/device/token  { device_code }
deviceAuthRouter.post("/device/token", async (req, res) => {
  const deviceCode = req.body?.device_code;
  if (typeof deviceCode !== "string" || !deviceCode) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const rows = await db
    .select()
    .from(deviceAuth)
    .where(eq(deviceAuth.deviceCodeHash, sha256(deviceCode)))
    .limit(1);
  const da = rows[0];

  if (!da) {
    res.status(400).json({ error: "invalid_grant" });
    return;
  }
  if (da.expiresAt.getTime() < Date.now()) {
    res.status(400).json({ error: "expired_token" });
    return;
  }
  if (da.status === "denied") {
    res.status(400).json({ error: "access_denied" });
    return;
  }
  if (da.status !== "linked" || !da.userId) {
    res.status(400).json({ error: "authorization_pending" });
    return;
  }

  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, da.userId))
    .limit(1);
  const user = userRows[0];
  if (!user) {
    res.status(400).json({ error: "invalid_grant" });
    return;
  }

  // Mint the device token once, snapshot the user's token_version, then delete
  // the pairing row so it can never mint twice.
  const token = deviceToken();
  await db.insert(devices).values({
    userId: da.userId,
    tokenHash: sha256(token),
    tokenVersion: user.tokenVersion,
    label: "Even G2",
  });
  await db.delete(deviceAuth).where(eq(deviceAuth.id, da.id));

  res.json({ device_token: token });
});
