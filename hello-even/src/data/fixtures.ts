// Dummy data for dev mode (VITE_DEV_MODE=true). Lets the UI render every screen
// with realistic content without a backend, device token, or pairing flow.
// Shapes mirror data/types.ts exactly so the rest of the app is none the wiser.

import type { Account, Transaction, RecurringStream } from "./types";

export const DEV_ACCOUNTS: Account[] = [
  {
    id: "dev-checking",
    name: "Everyday Checking",
    mask: "4821",
    subtype: "checking",
    currency: "USD",
    available: 2841.17,
    current: 2950.42,
  },
  {
    id: "dev-savings",
    name: "High-Yield Savings",
    mask: "0099",
    subtype: "savings",
    currency: "USD",
    available: 18420.0,
    current: 18420.0,
  },
];

// Mix of money-in/out, pending, and categories so every render path is covered.
// Dates are static strings (no Date.now()) for deterministic dev renders.
export const DEV_TRANSACTIONS: Transaction[] = [
  {
    id: "dev-txn-0",
    accountId: "dev-checking",
    name: "Starbucks",
    merchant: "Starbucks",
    amount: -7.45,
    isoDate: "2026-06-25",
    pending: true,
    category: "Food and Drink",
  },
  {
    id: "dev-txn-1",
    accountId: "dev-checking",
    name: "Blue Bottle Coffee",
    merchant: "Blue Bottle",
    amount: -6.75,
    isoDate: "2026-06-23",
    pending: true,
    category: "Food and Drink",
  },
  {
    id: "dev-txn-2",
    accountId: "dev-checking",
    name: "Whole Foods Market",
    merchant: "Whole Foods",
    amount: -84.23,
    isoDate: "2026-06-22",
    pending: false,
    category: "Groceries",
  },
  {
    id: "dev-txn-3",
    accountId: "dev-checking",
    name: "Payroll Deposit",
    merchant: null,
    amount: 3200.0,
    isoDate: "2026-06-20",
    pending: false,
    category: "Income",
  },
  {
    id: "dev-txn-4",
    accountId: "dev-checking",
    name: "Uber Trip",
    merchant: "Uber",
    amount: -19.4,
    isoDate: "2026-06-19",
    pending: false,
    category: "Travel",
  },
  {
    id: "dev-txn-5",
    accountId: "dev-savings",
    name: "Transfer to Savings",
    merchant: null,
    amount: -500.0,
    isoDate: "2026-06-18",
    pending: false,
    category: "Transfer",
  },
  {
    id: "dev-txn-6",
    accountId: "dev-checking",
    name: "Netflix",
    merchant: "Netflix",
    amount: -15.49,
    isoDate: "2026-06-17",
    pending: false,
    category: "Entertainment",
  },
];

export const DEV_RECURRING: RecurringStream[] = [
  { id: "dev-rec-1", name: "Netflix", frequency: "MONTHLY", amount: -15.49, currency: "USD", isActive: true },
  { id: "dev-rec-2", name: "Spotify", frequency: "MONTHLY", amount: -10.99, currency: "USD", isActive: true },
  { id: "dev-rec-3", name: "Amazon Prime", frequency: "MONTHLY", amount: -14.99, currency: "USD", isActive: true },
  { id: "dev-rec-4", name: "Apple iCloud", frequency: "MONTHLY", amount: -2.99, currency: "USD", isActive: true },
  { id: "dev-rec-5", name: "Con Edison", frequency: "MONTHLY", amount: -132.18, currency: "USD", isActive: true },
  { id: "dev-rec-6", name: "Gym Membership", frequency: "MONTHLY", amount: -49.99, currency: "USD", isActive: true },
];
