// Per-user Plaid operations. Access tokens come from the encrypted item store
// and are never returned to clients. Transactions are synced into our own cache
// table (webhook-driven in production; lazy on read as a dev fallback).

import {
  type CountryCode,
  type Products,
  type Transaction as PlaidTransaction,
  type TransactionStream,
} from "plaid";
import { plaidClient } from "../plaidClient";
import { config } from "../config";
import {
  type ApiAccount,
  type ApiRecurringStream,
  type ItemWithAccounts,
  HttpError,
} from "../types";
import * as itemStore from "./itemStore";
import { db } from "../db/client";
import { transactions } from "../db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

function client() {
  if (!plaidClient) throw new HttpError(500, "plaid_not_configured");
  return plaidClient;
}

function webhookUrl(): string | undefined {
  // Plaid rejects non-HTTPS webhooks; only register one when public over HTTPS.
  return config.publicBaseUrl.startsWith("https")
    ? `${config.publicBaseUrl}/api/plaid/webhook`
    : undefined;
}

// `accessToken` set => Plaid Link "update mode" for re-authenticating an item.
export async function createLinkToken(
  userId: string,
  accessToken?: string,
): Promise<string> {
  const resp = await client().linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "Even Bank",
    country_codes: config.plaid.countryCodes as CountryCode[],
    language: "en",
    webhook: webhookUrl(),
    ...(accessToken
      ? { access_token: accessToken }
      : { products: config.plaid.products as Products[] }),
  });
  return resp.data.link_token;
}

export async function exchangePublicToken(
  userId: string,
  publicToken: string,
  institution: string | null = null,
): Promise<{ itemId: string }> {
  const resp = await client().itemPublicTokenExchange({
    public_token: publicToken,
  });
  const itemId = resp.data.item_id;
  await itemStore.saveItem(userId, itemId, resp.data.access_token, institution);
  return { itemId };
}

// Tell Plaid to forget an item (revokes the access token), so unlinking a bank
// is complete on both sides. Best-effort: the local row is deleted regardless.
export async function removeItem(itemId: string): Promise<void> {
  const item = await itemStore.getItemByItemId(itemId);
  if (!item) return;
  const accessToken = itemStore.decryptAccessToken(item);
  await client().itemRemove({ access_token: accessToken });
}

// Linked banks grouped by item, each with its current accounts — for the phone
// management dashboard. An item that errors yields an empty accounts list (its
// status reflects why) rather than failing the whole dashboard.
export async function fetchItemsWithAccounts(
  userId: string,
): Promise<ItemWithAccounts[]> {
  const items = await itemStore.getUserItems(userId);
  const out: ItemWithAccounts[] = [];
  for (const item of items) {
    const accounts: ApiAccount[] = [];
    try {
      const accessToken = itemStore.decryptAccessToken(item);
      const resp = await client().accountsBalanceGet({ access_token: accessToken });
      for (const a of resp.data.accounts) {
        accounts.push({
          id: a.account_id,
          name: a.name,
          mask: a.mask ?? null,
          subtype: a.subtype ?? null,
          currency: a.balances.iso_currency_code ?? null,
          available: a.balances.available ?? null,
          current: a.balances.current ?? null,
        });
      }
    } catch (err) {
      handleItemError(item.itemId, err);
    }
    out.push({
      itemId: item.itemId,
      institution: item.institution,
      status: item.status,
      accounts,
    });
  }
  return out;
}

export async function fetchBalances(userId: string): Promise<ApiAccount[]> {
  const items = await itemStore.getUserItems(userId);
  const out: ApiAccount[] = [];
  for (const item of items) {
    try {
      const accessToken = itemStore.decryptAccessToken(item);
      const resp = await client().accountsBalanceGet({ access_token: accessToken });
      for (const a of resp.data.accounts) {
        out.push({
          id: a.account_id,
          name: a.name,
          mask: a.mask ?? null,
          subtype: a.subtype ?? null,
          currency: a.balances.iso_currency_code ?? null,
          available: a.balances.available ?? null,
          current: a.balances.current ?? null,
        });
      }
    } catch (err) {
      handleItemError(item.itemId, err);
    }
  }
  return out;
}

// Plaid's recurring-pattern analysis can take 20-30 s; give it generous headroom.
const RECURRING_PLAID_TIMEOUT_MS = 40_000;
// Retry up to 3 times when Plaid hasn't finished indexing yet.
const RECURRING_RETRY_ATTEMPTS = 3;
const RECURRING_RETRY_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRecurringForItem(
  accessToken: string,
  itemId: string,
): Promise<ApiRecurringStream[]> {
  for (let attempt = 0; attempt <= RECURRING_RETRY_ATTEMPTS; attempt++) {
    try {
      const resp = await client().transactionsRecurringGet(
        { access_token: accessToken },
        { timeout: RECURRING_PLAID_TIMEOUT_MS },
      );
      const streams = resp.data.outflow_streams as TransactionStream[];
      logger.info(
        { itemId, total: streams.length, attempt },
        "[plaid] recurring streams returned",
      );
      return streams
        .filter((s) => s.is_active && s.status !== "TOMBSTONED")
        .map((s) => ({
          id: s.stream_id,
          name: s.merchant_name ?? s.description,
          frequency: s.frequency,
          // Plaid outflow amounts are positive; negate to match our sign convention
          amount: -(s.last_amount.amount ?? 0),
          currency: s.last_amount.iso_currency_code ?? null,
          isActive: s.is_active,
        }));
    } catch (err) {
      const code = plaidErrorCode(err);
      if (code === "PRODUCT_NOT_READY" && attempt < RECURRING_RETRY_ATTEMPTS) {
        logger.warn(
          { itemId, attempt, nextIn: RECURRING_RETRY_DELAY_MS },
          "[plaid] recurring PRODUCT_NOT_READY — retrying",
        );
        await sleep(RECURRING_RETRY_DELAY_MS);
        continue;
      }
      handleItemError(itemId, err);
      return [];
    }
  }
  return [];
}

export async function fetchRecurring(userId: string): Promise<ApiRecurringStream[]> {
  const items = await itemStore.getUserItems(userId);
  const results = await Promise.all(
    items.map((item) =>
      fetchRecurringForItem(itemStore.decryptAccessToken(item), item.itemId),
    ),
  );
  return results.flat();
}

// Pull transactions/sync for one item into the cache table.
export async function syncItemTransactions(itemId: string): Promise<void> {
  const item = await itemStore.getItemByItemId(itemId);
  if (!item) return;
  const accessToken = itemStore.decryptAccessToken(item);

  let cursor = item.cursor ?? undefined;
  const added: PlaidTransaction[] = [];
  const modified: PlaidTransaction[] = [];
  const removed: string[] = [];

  try {
    let hasMore = true;
    while (hasMore) {
      const resp = await client().transactionsSync({
        access_token: accessToken,
        cursor,
      });
      added.push(...resp.data.added);
      modified.push(...resp.data.modified);
      removed.push(...resp.data.removed.map((r) => r.transaction_id));
      hasMore = resp.data.has_more;
      cursor = resp.data.next_cursor;
    }
  } catch (err) {
    const code = plaidErrorCode(err);
    if (code === "PRODUCT_NOT_READY") return; // not ready yet; webhook will re-fire
    handleItemError(itemId, err);
    return;
  }

  for (const t of [...added, ...modified]) {
    const row = {
      id: t.transaction_id,
      userId: item.userId,
      itemId,
      accountId: t.account_id,
      name: t.name,
      merchant: t.merchant_name ?? null,
      amount: -t.amount, // flip Plaid sign: negative = spend, positive = income
      isoDate: t.date,
      pending: t.pending,
      category:
        t.personal_finance_category?.primary ?? t.category?.[0] ?? null,
      updatedAt: new Date(),
    };
    await db
      .insert(transactions)
      .values(row)
      .onConflictDoUpdate({ target: transactions.id, set: row });
  }
  for (const id of removed) {
    await db.delete(transactions).where(eq(transactions.id, id));
  }
  if (cursor) await itemStore.setCursor(itemId, cursor);
}

function plaidErrorCode(err: unknown): string | undefined {
  return (err as { response?: { data?: { error_code?: string } } })?.response
    ?.data?.error_code;
}

function handleItemError(itemId: string, err: unknown): void {
  const code = plaidErrorCode(err);
  if (code === "ITEM_LOGIN_REQUIRED") {
    void itemStore.setStatus(itemId, "login_required");
    logger.warn({ itemId }, "[plaid] item needs re-auth (ITEM_LOGIN_REQUIRED)");
    return;
  }
  // PRODUCT_NOT_READY means Plaid hasn't finished indexing yet; return empty data.
  if (code === "PRODUCT_NOT_READY") {
    logger.warn({ itemId }, "[plaid] recurring PRODUCT_NOT_READY — Plaid is still indexing, streams will appear once ready");
    return;
  }
  logger.error({ itemId, code }, "[plaid] item error");
}
