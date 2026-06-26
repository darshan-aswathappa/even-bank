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
// Always syncs via the Plaid cursor before reading from cache. The incremental
// cursor-based sync is fast (near-instant when nothing has changed) so the
// added latency is minimal. This is essential for pending transactions: they
// appear in Plaid's transactionsSync `added` array and would be invisible if
// we only synced on webhook delivery (which never reaches localhost in dev).
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

    // Sync all items in parallel. Each call advances the cursor so posted and
    // pending transactions are always current, not just on first load.
    const items = await itemStore.getUserItems(userId);
    await Promise.all(items.map((item) => plaidService.syncItemTransactions(item.itemId)));

    const rows = await readCache(userId, accountId);
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
  // Pending-first within the same date so they are never crowded out by the
  // 20-row limit when many posted transactions exist.
  const rows = await db
    .select()
    .from(transactions)
    .where(where)
    .orderBy(desc(transactions.pending), desc(transactions.isoDate))
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
