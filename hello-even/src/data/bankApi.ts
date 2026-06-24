import { API_BASE_URL, REQUEST_TIMEOUT_MS, DEV_MODE } from "../config";
import { getDeviceToken } from "./session";
import { DEV_ACCOUNTS, DEV_TRANSACTIONS } from "./fixtures";
import type {
  Account,
  Transaction,
  BalancesResponse,
  TransactionsResponse,
} from "./types";

// Thrown when the backend rejects our device token (missing/expired/revoked).
// main.ts catches this to re-run the pairing flow.
export class UnauthorizedError extends Error {}

async function apiGet<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const token = getDeviceToken();
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
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
