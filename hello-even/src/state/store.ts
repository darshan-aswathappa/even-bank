// Immutable app state + transitions, plus cache (de)serialization for
// setLocalStorage. No SDK or rendering concerns here.

import type { Account, Transaction } from "../data/types";

export type Screen = "pairing" | "balance" | "transactions" | "detail";
export type Status = "loading" | "ready" | "offline";

export interface AppState {
  readonly screen: Screen;
  readonly status: Status;
  readonly accounts: readonly Account[];
  readonly transactions: readonly Transaction[];
  readonly selectedTxnIndex: number;
  readonly lastUpdated: number | null; // epoch ms
}

export const initialState: AppState = {
  screen: "balance",
  status: "loading",
  accounts: [],
  transactions: [],
  selectedTxnIndex: 0,
  lastUpdated: null,
};

export function withData(
  s: AppState,
  accounts: Account[],
  transactions: Transaction[],
  lastUpdated: number,
): AppState {
  return { ...s, accounts, transactions, lastUpdated, status: "ready" };
}

export function withStatus(s: AppState, status: Status): AppState {
  return { ...s, status };
}

export function navigate(s: AppState, screen: Screen): AppState {
  return { ...s, screen };
}

export function selectTransaction(s: AppState, index: number): AppState {
  return { ...s, screen: "detail", selectedTxnIndex: index };
}

export function selectedTransaction(s: AppState): Transaction | null {
  return s.transactions[s.selectedTxnIndex] ?? null;
}

// --- persistence cache (stored as a JSON string via setLocalStorage) ---

export interface CacheShape {
  accounts: Account[];
  transactions: Transaction[];
  lastUpdated: number;
}

export function toCache(s: AppState): CacheShape {
  return {
    accounts: [...s.accounts],
    transactions: [...s.transactions],
    lastUpdated: s.lastUpdated ?? Date.now(),
  };
}

export function fromCache(json: string | null): CacheShape | null {
  if (!json) return null;
  try {
    const c = JSON.parse(json) as CacheShape;
    if (c && Array.isArray(c.accounts) && Array.isArray(c.transactions)) {
      return c;
    }
  } catch {
    // ignore malformed cache
  }
  return null;
}
