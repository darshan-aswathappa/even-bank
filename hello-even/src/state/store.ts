// Immutable app state + transitions. No SDK or rendering concerns here.
// Bank data is never persisted — every launch fetches live (no cache).

import type { Account, Transaction, RecurringStream } from "../data/types";

export type Screen = "pairing" | "balance" | "recurring" | "transactions" | "detail";
// Balances and transactions load independently (a slow transaction sync must
// never blank balances), so each tracks its own phase: "loading" until the
// first success, "ready" after, "offline" when a fetch fails.
export type Phase = "loading" | "ready" | "offline";

export interface AppState {
  readonly screen: Screen;
  readonly accounts: readonly Account[];
  readonly transactions: readonly Transaction[];
  readonly recurringStreams: readonly RecurringStream[];
  readonly accountsPhase: Phase;
  readonly txnsPhase: Phase;
  readonly recurringPhase: Phase;
  readonly selectedTxnIndex: number;
}

export const initialState: AppState = {
  screen: "balance",
  accounts: [],
  transactions: [],
  recurringStreams: [],
  accountsPhase: "loading",
  txnsPhase: "loading",
  recurringPhase: "loading",
  selectedTxnIndex: 0,
};

export function withAccounts(s: AppState, accounts: Account[]): AppState {
  return { ...s, accounts, accountsPhase: "ready" };
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

export function withRecurring(s: AppState, recurringStreams: RecurringStream[]): AppState {
  return { ...s, recurringStreams, recurringPhase: "ready" };
}

export function withRecurringPhase(s: AppState, phase: Phase): AppState {
  return { ...s, recurringPhase: phase };
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
