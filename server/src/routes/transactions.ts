import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { mode } from "../config";
import * as mockService from "../services/mockService";
import * as plaidService from "../services/plaidService";
import * as itemStore from "../services/itemStore";
import { db } from "../db/client";
import { transactions } from "../db/schema";
import { type TransactionsResponse, type ApiTransaction } from "../types";

export const transactionsRouter = Router();
const MAX_TRANSACTIONS = 20;

// GET /api/transactions?account_id=... -> the user's latest transactions.
// Served from our cache table (populated by webhooks in prod). As a dev
// fallback when webhooks can't reach localhost, we sync on read if the cache
// is empty for this user.
transactionsRouter.get("/transactions", async (req, res) => {
  try {
    const userId = req.userId!;
    const accountId =
      typeof req.query.account_id === "string" ? req.query.account_id : null;

    if (mode === "mock") {
      const all = mockService.getTransactions();
      const list = all
        .filter((t) => !accountId || t.accountId === accountId)
        .slice(0, MAX_TRANSACTIONS);
      res.json({ mode, transactions: list } satisfies TransactionsResponse);
      return;
    }

    let rows = await readCache(userId, accountId);
    if (rows.length === 0) {
      // Dev fallback: no webhook has populated the cache yet — sync now.
      const items = await itemStore.getUserItems(userId);
      for (const item of items) await plaidService.syncItemTransactions(item.itemId);
      rows = await readCache(userId, accountId);
    }
    res.json({ mode, transactions: rows } satisfies TransactionsResponse);
  } catch (err) {
    console.error("[transactions] error:", err);
    res.status(502).json({ error: "upstream_error" });
  }
});

async function readCache(
  userId: string,
  accountId: string | null,
): Promise<ApiTransaction[]> {
  const where = accountId
    ? and(eq(transactions.userId, userId), eq(transactions.accountId, accountId))
    : eq(transactions.userId, userId);
  const rows = await db
    .select()
    .from(transactions)
    .where(where)
    .orderBy(desc(transactions.isoDate))
    .limit(MAX_TRANSACTIONS);
  return rows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    name: r.name,
    merchant: r.merchant,
    amount: r.amount,
    isoDate: r.isoDate,
    pending: r.pending,
    category: r.category,
  }));
}
