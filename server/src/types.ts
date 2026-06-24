// Normalized API shapes returned by this backend. The glasses frontend depends
// on exactly these shapes, regardless of whether the data came from Plaid or
// the built-in mock — so the frontend never changes when Plaid is wired up.

export type Mode = "mock" | "live";

export interface ApiAccount {
  id: string;
  name: string;
  mask: string | null; // last 4 digits, e.g. "1234"
  subtype: string | null; // "checking" | "savings" | "credit card" ...
  currency: string | null; // ISO code, e.g. "USD"
  available: number | null;
  current: number | null;
}

export interface ApiTransaction {
  id: string;
  accountId: string;
  name: string;
  merchant: string | null;
  // Signed so NEGATIVE = money out (spend), POSITIVE = money in. This is the
  // inverse of Plaid's raw convention (Plaid: positive = outflow); we flip it
  // here so the frontend can render it intuitively.
  amount: number;
  isoDate: string; // "YYYY-MM-DD"
  pending: boolean;
  category: string | null;
}

export interface BalancesResponse {
  mode: Mode;
  accounts: ApiAccount[];
}

export interface TransactionsResponse {
  mode: Mode;
  transactions: ApiTransaction[];
}

// Small typed error so routes can map failures to HTTP status codes.
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}
