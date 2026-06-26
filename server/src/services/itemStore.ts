// Per-user Plaid item storage. Access tokens are encrypted at rest (AES-256-GCM,
// AAD bound to user_id|item_id) and only ever decrypted in-process for a Plaid call.

import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { plaidItems, transactions } from "../db/schema";
import { encrypt, decrypt, aad } from "../crypto/encryption";

export type PlaidItemRow = typeof plaidItems.$inferSelect;

export async function saveItem(
  userId: string,
  itemId: string,
  accessToken: string,
  institution: string | null = null,
): Promise<void> {
  const rec = encrypt(accessToken, aad(userId, itemId));
  await db
    .insert(plaidItems)
    .values({
      userId,
      itemId,
      accessTokenCt: rec.ciphertext,
      accessTokenIv: rec.iv,
      accessTokenTag: rec.authTag,
      keyId: rec.keyId,
      institution,
      status: "good",
    })
    .onConflictDoUpdate({
      target: plaidItems.itemId,
      set: {
        userId,
        accessTokenCt: rec.ciphertext,
        accessTokenIv: rec.iv,
        accessTokenTag: rec.authTag,
        keyId: rec.keyId,
        status: "good",
        updatedAt: new Date(),
      },
    });
}

// Mock-mode placeholder item so the dashboard's "linked banks" + unlink flow
// work without Plaid credentials. No KEK is configured in mock mode, so the
// access-token columns hold empty buffers and are NEVER decrypted (mock mode
// reads balances from the mock service, not from Plaid). One row per user.
export async function saveMockItem(userId: string): Promise<string> {
  const itemId = `mock-${userId}`;
  const empty = Buffer.alloc(0);
  await db
    .insert(plaidItems)
    .values({
      userId,
      itemId,
      accessTokenCt: empty,
      accessTokenIv: empty,
      accessTokenTag: empty,
      keyId: "mock",
      institution: "Mock Bank",
      status: "good",
    })
    .onConflictDoNothing({ target: plaidItems.itemId });
  return itemId;
}

export async function getUserItems(userId: string): Promise<PlaidItemRow[]> {
  return db.select().from(plaidItems).where(eq(plaidItems.userId, userId));
}

// Remove a linked bank locally: its cached transactions first (no DB cascade
// from plaid_items to transactions), then the item row itself.
export async function deleteItem(itemId: string): Promise<void> {
  await db.delete(transactions).where(eq(transactions.itemId, itemId));
  await db.delete(plaidItems).where(eq(plaidItems.itemId, itemId));
}

export async function getItemByItemId(
  itemId: string,
): Promise<PlaidItemRow | undefined> {
  return (
    await db.select().from(plaidItems).where(eq(plaidItems.itemId, itemId)).limit(1)
  )[0];
}

export function decryptAccessToken(item: PlaidItemRow): string {
  return decrypt(
    {
      ciphertext: item.accessTokenCt,
      iv: item.accessTokenIv,
      authTag: item.accessTokenTag,
      keyId: item.keyId,
    },
    aad(item.userId, item.itemId),
  );
}

export async function setCursor(itemId: string, cursor: string): Promise<void> {
  await db
    .update(plaidItems)
    .set({ cursor, updatedAt: new Date() })
    .where(eq(plaidItems.itemId, itemId));
}

export async function setStatus(
  itemId: string,
  status: "good" | "login_required" | "error",
): Promise<void> {
  await db
    .update(plaidItems)
    .set({ status, updatedAt: new Date() })
    .where(eq(plaidItems.itemId, itemId));
}
