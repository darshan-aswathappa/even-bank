// Phone-side management endpoints, called by the glasses app's WebView using
// the same device token as the data endpoints (requireDevice upstream).
//   GET    /api/manage/accounts -> linked banks + their accounts
//   DELETE /api/manage/item      -> unlink one bank (Plaid item)
//   DELETE /api/manage/device    -> unpair the glasses (revoke device tokens)

import { Router } from "express";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { mode } from "../config";
import { db } from "../db/client";
import { devices } from "../db/schema";
import * as itemStore from "../services/itemStore";
import * as plaidService from "../services/plaidService";
import * as mockService from "../services/mockService";
import { type ManageAccountsResponse, HttpError } from "../types";

export const manageRouter = Router();

// GET /api/manage/accounts
manageRouter.get("/manage/accounts", async (req, res) => {
  try {
    const userId = req.userId!;

    if (mode === "mock") {
      const items = await itemStore.getUserItems(userId);
      const body: ManageAccountsResponse = {
        mode,
        items: items.map((it) => ({
          itemId: it.itemId,
          institution: it.institution ?? "Mock Bank",
          status: it.status,
          accounts: mockService.getBalances(),
        })),
      };
      res.json(body);
      return;
    }

    const items = await plaidService.fetchItemsWithAccounts(userId);
    const body: ManageAccountsResponse = { mode, items };
    res.json(body);
  } catch (err) {
    sendErr(res, err, "manage/accounts");
  }
});

// DELETE /api/manage/item  { itemId }
const itemSchema = z.object({ itemId: z.string().min(1) });
manageRouter.delete("/manage/item", async (req, res) => {
  try {
    const userId = req.userId!;
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    // Ownership check: never let one user delete another's item.
    const item = await itemStore.getItemByItemId(parsed.data.itemId);
    if (!item || item.userId !== userId) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    if (mode === "live") await plaidService.removeItem(item.itemId);
    await itemStore.deleteItem(item.itemId);
    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err, "manage/item");
  }
});

// DELETE /api/manage/device — unpair the glasses. Revokes the user's active
// device token(s); the glasses' next API call 401s and re-enters pairing, and
// the WebView returns to onboarding.
manageRouter.delete("/manage/device", async (req, res) => {
  try {
    const userId = req.userId!;
    await db
      .update(devices)
      .set({ revokedAt: new Date() })
      .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)));
    res.json({ ok: true });
  } catch (err) {
    sendErr(res, err, "manage/device");
  }
});

function sendErr(res: import("express").Response, err: unknown, ctx: string) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code });
    return;
  }
  console.error(`[${ctx}] error:`, err);
  res.status(502).json({ error: "upstream_error" });
}
