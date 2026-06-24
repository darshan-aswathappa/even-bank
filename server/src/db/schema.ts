// Postgres schema (Drizzle). Multi-user: every row of bank data is owned by a
// user and isolated by user_id. Secrets (Plaid access tokens, device tokens,
// device/login codes) are NEVER stored in plaintext — only ciphertext or hashes.

import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  doublePrecision,
  customType,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// Postgres BYTEA (Drizzle has no built-in bytea type).
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(), // stored lowercased; unique via index below
    emailVerified: boolean("email_verified").notNull().default(false),
    // Bump to revoke ALL of a user's devices at once.
    tokenVersion: integer("token_version").notNull().default(1),
    status: text("status").notNull().default("active"), // active | disabled
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: bytea("token_hash").notNull(), // SHA-256 of the device token
    tokenVersion: integer("token_version").notNull(), // snapshot of users.tokenVersion at issue
    label: text("label"),
    evenUidHint: text("even_uid_hint"), // untrusted bridge.getUserInfo uid — hint only
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }), // null = active
  },
  (t) => [
    uniqueIndex("devices_token_hash_unique").on(t.tokenHash),
    index("devices_user_id_idx").on(t.userId),
  ],
);

export const plaidItems = pgTable(
  "plaid_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(), // Plaid item_id (unique index below)
    // Plaid access token, AES-256-GCM encrypted at rest:
    accessTokenCt: bytea("access_token_ct").notNull(),
    accessTokenIv: bytea("access_token_iv").notNull(),
    accessTokenTag: bytea("access_token_tag").notNull(),
    encDek: bytea("enc_dek"), // null = direct-KEK; set = envelope (wrapped DEK)
    keyId: text("key_id").notNull().default("kek-v1"),
    cursor: text("cursor"), // transactions/sync cursor (not secret)
    institution: text("institution"),
    status: text("status").notNull().default("good"), // good | login_required | error
    consentExpiresAt: timestamp("consent_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("plaid_items_item_id_unique").on(t.itemId),
    index("plaid_items_user_id_idx").on(t.userId),
  ],
);

// RFC 8628 device-authorization state (the pending pairing).
export const deviceAuth = pgTable(
  "device_auth",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceCodeHash: bytea("device_code_hash").notNull(), // SHA-256 of device_code
    userCode: text("user_code"), // short human-typed code (rate-limited)
    status: text("status").notNull().default("pending"), // pending|authorized|linked|denied|expired
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    pollIntervalS: integer("poll_interval_s").notNull().default(5),
    attempts: integer("attempts").notNull().default(0), // failed user_code entries
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("device_auth_code_hash_unique").on(t.deviceCodeHash),
    uniqueIndex("device_auth_user_code_unique").on(t.userCode),
  ],
);

// Email magic-link tokens.
export const loginTokens = pgTable(
  "login_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    tokenHash: bytea("token_hash").notNull(),
    deviceCodeId: uuid("device_code_id").references(() => deviceAuth.id, {
      onDelete: "cascade",
    }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("login_tokens_hash_unique").on(t.tokenHash)],
);

// Per-user transaction cache, populated by Plaid webhooks (sync off the request path).
export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(), // Plaid transaction_id
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    accountId: text("account_id").notNull(),
    name: text("name").notNull(),
    merchant: text("merchant"),
    amount: doublePrecision("amount").notNull(), // negative = spend, positive = income
    isoDate: text("iso_date").notNull(),
    pending: boolean("pending").notNull().default(false),
    category: text("category"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_user_id_idx").on(t.userId),
    index("transactions_user_date_idx").on(t.userId, t.isoDate),
  ],
);
