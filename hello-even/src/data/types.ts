// Mirrors the backend's normalized API shapes (server/src/types.ts). The app
// is agnostic to whether the data came from Plaid or the mock backend.

export type Mode = "mock" | "live";

export interface Account {
  id: string;
  name: string;
  mask: string | null; // last 4 digits
  subtype: string | null;
  currency: string | null; // ISO code
  available: number | null;
  current: number | null;
}

export interface Transaction {
  id: string;
  accountId: string;
  name: string;
  merchant: string | null;
  amount: number; // negative = money out (spend), positive = money in
  isoDate: string; // "YYYY-MM-DD"
  pending: boolean;
  category: string | null;
}

export interface BalancesResponse {
  mode: Mode;
  accounts: Account[];
}

export interface TransactionsResponse {
  mode: Mode;
  transactions: Transaction[];
}
