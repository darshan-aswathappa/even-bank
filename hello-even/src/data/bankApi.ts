import { API_BASE_URL, REQUEST_TIMEOUT_MS, DEV_MODE } from "../config";
import { getDeviceToken } from "./session";
import { DEV_ACCOUNTS, DEV_TRANSACTIONS, DEV_RECURRING } from "./fixtures";
import type {
  Account,
  Transaction,
  RecurringStream,
  BalancesResponse,
  TransactionsResponse,
  RecurringResponse,
  LinkedItem,
  ManageAccountsResponse,
} from "./types";

// Thrown when the backend rejects our device token (missing/expired/revoked).
// main.ts catches this to re-run the pairing flow.
export class UnauthorizedError extends Error {}

async function apiGet<T>(path: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const token = getDeviceToken();
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
      // Bank balances/transactions must always be live — never served from any
      // HTTP cache. Force a network hit on every request.
      cache: "no-store",
    });
    if (res.status === 401) throw new UnauthorizedError(`401 for ${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function getBalances(): Promise<Account[]> {
  if (DEV_MODE) return DEV_ACCOUNTS;
  return (await apiGet<BalancesResponse>("/balances")).accounts;
}

export async function getLinkedItems(): Promise<LinkedItem[]> {
  if (DEV_MODE) {
    return [{ itemId: "dev", institution: "Dev Bank", status: "good", accounts: DEV_ACCOUNTS }];
  }
  return (await apiGet<ManageAccountsResponse>("/manage/accounts")).items;
}

// Plaid's recurring-pattern analysis can take 20-30 s on a production item.
// The server retries up to 3× on PRODUCT_NOT_READY (3 × 5 s + Plaid call).
const RECURRING_TIMEOUT_MS = 75_000;

export async function getRecurring(): Promise<RecurringStream[]> {
  if (DEV_MODE) return DEV_RECURRING;
  return (await apiGet<RecurringResponse>("/recurring", RECURRING_TIMEOUT_MS)).outflow;
}

export async function getTransactions(
  accountId?: string,
): Promise<Transaction[]> {
  if (DEV_MODE) {
    return accountId
      ? DEV_TRANSACTIONS.filter((t) => t.accountId === accountId)
      : DEV_TRANSACTIONS;
  }
  const query = accountId ? `?account_id=${encodeURIComponent(accountId)}` : "";
  return (await apiGet<TransactionsResponse>(`/transactions${query}`)).transactions;
}
