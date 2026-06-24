import type { ApiAccount, ApiTransaction } from "../types";

// Plaid-shaped demo data used when no Plaid credentials are configured.
// Mirrors the normalized shapes in types.ts so the frontend behaves identically
// in mock and live modes.

const ACCOUNTS: ApiAccount[] = [
  {
    id: "acc_checking",
    name: "Everyday Checking",
    mask: "1234",
    subtype: "checking",
    currency: "USD",
    available: 4231.07,
    current: 4231.07,
  },
  {
    id: "acc_savings",
    name: "High-Yield Savings",
    mask: "5678",
    subtype: "savings",
    currency: "USD",
    available: 18250.42,
    current: 18250.42,
  },
  {
    id: "acc_credit",
    name: "Travel Credit Card",
    mask: "9012",
    subtype: "credit card",
    currency: "USD",
    available: 7400.0,
    current: -1843.55,
  },
];

// Negative = money out (spend), positive = money in.
const TRANSACTIONS: ApiTransaction[] = [
  { id: "txn_01", accountId: "acc_checking", name: "Starbucks", merchant: "Starbucks", amount: -5.4, isoDate: "2026-06-23", pending: true, category: "Food and Drink" },
  { id: "txn_02", accountId: "acc_checking", name: "Whole Foods Market", merchant: "Whole Foods", amount: -86.21, isoDate: "2026-06-22", pending: false, category: "Groceries" },
  { id: "txn_03", accountId: "acc_checking", name: "Payroll Deposit", merchant: "Acme Corp", amount: 2450.0, isoDate: "2026-06-21", pending: false, category: "Income" },
  { id: "txn_04", accountId: "acc_credit", name: "Uber", merchant: "Uber", amount: -18.75, isoDate: "2026-06-21", pending: false, category: "Travel" },
  { id: "txn_05", accountId: "acc_checking", name: "Con Edison", merchant: "Con Edison", amount: -132.18, isoDate: "2026-06-20", pending: false, category: "Utilities" },
  { id: "txn_06", accountId: "acc_credit", name: "Amazon", merchant: "Amazon", amount: -64.99, isoDate: "2026-06-20", pending: false, category: "Shopping" },
  { id: "txn_07", accountId: "acc_checking", name: "Transfer to Savings", merchant: null, amount: -500.0, isoDate: "2026-06-19", pending: false, category: "Transfer" },
  { id: "txn_08", accountId: "acc_savings", name: "Transfer from Checking", merchant: null, amount: 500.0, isoDate: "2026-06-19", pending: false, category: "Transfer" },
  { id: "txn_09", accountId: "acc_credit", name: "Delta Air Lines", merchant: "Delta", amount: -412.3, isoDate: "2026-06-18", pending: false, category: "Travel" },
  { id: "txn_10", accountId: "acc_checking", name: "Spotify", merchant: "Spotify", amount: -10.99, isoDate: "2026-06-18", pending: false, category: "Entertainment" },
  { id: "txn_11", accountId: "acc_checking", name: "Shell", merchant: "Shell", amount: -54.12, isoDate: "2026-06-17", pending: false, category: "Gas" },
  { id: "txn_12", accountId: "acc_credit", name: "Apple", merchant: "Apple", amount: -2.99, isoDate: "2026-06-17", pending: false, category: "Shopping" },
];

export function getBalances(): ApiAccount[] {
  return ACCOUNTS;
}

export function getTransactions(): ApiTransaction[] {
  return TRANSACTIONS;
}
