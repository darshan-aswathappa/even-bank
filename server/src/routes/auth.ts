// Phone-side authentication: email magic-link + pairing approval.
//  POST /api/auth/magic-link  -> email a sign-in link
//  GET  /api/auth/callback    -> consume link, set session cookie, redirect
//  POST /api/device/approve   -> (session) bind a user_code to this user

import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { users, loginTokens, deviceAuth, plaidItems } from "../db/schema";
import { sha256, randomToken, normalizeUserCode } from "../crypto/tokens";
import { sendMagicLink } from "../services/email";
import { getSession, requireSession } from "../middleware/session";
import { userHasGoodItem } from "../services/itemStore";
import { config } from "../config";

export const authRouter = Router();

const LOGIN_TTL_MS = 15 * 60 * 1000;

// GET /api/auth/me -> session state for the onboarding page.
authRouter.get("/auth/me", async (req, res) => {
  const session = await getSession(req, res);
  if (!session.userId) {
    res.json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, hasItem: await userHasGoodItem(session.userId) });
});

// POST /api/auth/magic-link  { email }
const emailSchema = z.object({ email: z.string().email() });
authRouter.post("/auth/magic-link", async (req, res) => {
  const parsed = emailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_email" });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  const token = randomToken(32);
  await db.insert(loginTokens).values({
    email,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + LOGIN_TTL_MS),
  });
  const url = `${config.publicBaseUrl}/api/auth/callback?token=${encodeURIComponent(token)}`;
  await sendMagicLink(email, url);
  // Never reveal whether the email exists.
  res.json({ ok: true });
});

// GET /api/auth/callback?token=...
authRouter.get("/auth/callback", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) {
    res.status(400).send("Invalid link.");
    return;
  }
  const rows = await db
    .select()
    .from(loginTokens)
    .where(eq(loginTokens.tokenHash, sha256(token)))
    .limit(1);
  const lt = rows[0];
  if (!lt || lt.consumedAt || lt.expiresAt.getTime() < Date.now()) {
    res.status(400).send("This sign-in link is invalid or has expired.");
    return;
  }

  await db
    .update(loginTokens)
    .set({ consumedAt: new Date() })
    .where(eq(loginTokens.id, lt.id));

  // Upsert the user (verified by virtue of clicking the emailed link).
  let user = (
    await db.select().from(users).where(eq(users.email, lt.email)).limit(1)
  )[0];
  if (!user) {
    user = (
      await db
        .insert(users)
        .values({ email: lt.email, emailVerified: true })
        .returning()
    )[0];
  } else if (!user.emailVerified) {
    await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, user.id));
  }

  const session = await getSession(req, res);
  session.userId = user.id;
  await session.save();
  res.redirect("/onboarding");
});

// POST /api/device/approve  { user_code }   (requires phone session)
const approveSchema = z.object({ user_code: z.string().min(4).max(32) });
authRouter.post("/device/approve", requireSession, async (req, res) => {
  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  const userId = req.userId!;
  const code = normalizeUserCode(parsed.data.user_code);

  const da = (
    await db.select().from(deviceAuth).where(eq(deviceAuth.userCode, code)).limit(1)
  )[0];
  if (!da || da.status === "denied" || da.expiresAt.getTime() < Date.now()) {
    res.status(404).json({ error: "invalid_or_expired_code" });
    return;
  }

  // If the user already has a linked bank, pairing completes immediately;
  // otherwise they must link a bank next (status stays 'authorized').
  const hasItem =
    (
      await db
        .select({ id: plaidItems.id })
        .from(plaidItems)
        .where(and(eq(plaidItems.userId, userId), eq(plaidItems.status, "good")))
        .limit(1)
    ).length > 0;

  await db
    .update(deviceAuth)
    .set({ userId, status: hasItem ? "linked" : "authorized" })
    .where(eq(deviceAuth.id, da.id));

  const session = await getSession(req, res);
  session.deviceAuthId = da.id;
  await session.save();

  res.json({ ok: true, needsBankLink: !hasItem });
});
