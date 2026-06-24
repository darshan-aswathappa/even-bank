// Plaid Link endpoints — now behind the phone SESSION (no longer public).
//  POST /api/link/token/create        -> per-user link token
//  POST /api/item/public_token/exchange -> store encrypted token, finish pairing

import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { mode } from "../config";
import * as plaidService from "../services/plaidService";
import { requireSession, getSession } from "../middleware/session";
import { db } from "../db/client";
import { deviceAuth } from "../db/schema";
import { HttpError } from "../types";

export const linkRouter = Router();

// POST /api/link/token/create  (session)
linkRouter.post("/link/token/create", requireSession, async (req, res) => {
  try {
    if (mode === "mock") {
      res.json({ mode });
      return;
    }
    const linkToken = await plaidService.createLinkToken(req.userId!);
    res.json({ mode, link_token: linkToken });
  } catch (err) {
    sendErr(res, err, "link/token/create");
  }
});

// POST /api/item/public_token/exchange  { public_token }  (session)
const exchangeSchema = z.object({ public_token: z.string().min(1) });
linkRouter.post(
  "/item/public_token/exchange",
  requireSession,
  async (req, res) => {
    try {
      const userId = req.userId!;
      if (mode !== "mock") {
        const parsed = exchangeSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "missing_public_token" });
          return;
        }
        await plaidService.exchangePublicToken(userId, parsed.data.public_token);
      }

      // Finish the pairing bound to this session: mark it linked so the glasses'
      // poll can mint a device token.
      const session = await getSession(req, res);
      if (session.deviceAuthId) {
        await db
          .update(deviceAuth)
          .set({ status: "linked" })
          .where(eq(deviceAuth.id, session.deviceAuthId));
      }
      res.json({ ok: true, mode });
    } catch (err) {
      sendErr(res, err, "public_token/exchange");
    }
  },
);

function sendErr(res: import("express").Response, err: unknown, ctx: string) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code });
    return;
  }
  console.error(`[${ctx}] error:`, err);
  res.status(502).json({ error: "upstream_error" });
}
