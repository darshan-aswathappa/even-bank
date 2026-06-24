// Immutable app state + transitions, plus cache (de)serialization for
// setLocalStorage. No SDK or rendering concerns here.

import type { Account, Transaction } from "../data/types";

export type Screen = "pairing" | "balance" | "transactions" | "detail";
// Balances and transactions load independently (a slow transaction sync must
// never blank balances), so each tracks its own phase: "loading" until the
// first success, "ready" after, "offline" when a fetch fails.
export type Phase = "loading" | "ready" | "offline";

export interface AppState {
  readonly screen: Screen;
  readonly accounts: readonly Account[];
  readonly transactions: readonly Transaction[];
  readonly accountsPhase: Phase;
  readonly txnsPhase: Phase;
  readonly selectedTxnIndex: number;
  readonly lastUpdated: number | null; // epoch ms of last successful balances fetch
}

export const initialState: AppState = {
  screen: "balance",
  accounts: [],
  transactions: [],
  accountsPhase: "loading",
  txnsPhase: "loading",
  selectedTxnIndex: 0,
  lastUpdated: null,
};

export function withAccounts(
  s: AppState,
  accounts: Account[],
  lastUpdated: number,
): AppState {
  return { ...s, accounts, lastUpdated, accountsPhase: "ready" };
}

export function withTransactions(
  s: AppState,
  transactions: Transaction[],
): AppState {
  return { ...s, transactions, txnsPhase: "ready" };
}

export function withAccountsPhase(s: AppState, phase: Phase): AppState {
  return { ...s, accountsPhase: phase };
}

export function withTransactionsPhase(s: AppState, phase: Phase): AppState {
  return { ...s, txnsPhase: phase };
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

// Seed state from cache for an instant first paint. Cached data counts as
// "ready" (shown with its relative timestamp) until a live refresh replaces it.
export function withCache(s: AppState, c: CacheShape): AppState {
  return {
    ...s,
    accounts: c.accounts,
    transactions: c.transactions,
    lastUpdated: c.lastUpdated,
    accountsPhase: "ready",
    txnsPhase: "ready",
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
