// Per-user Plaid item storage. Access tokens are encrypted at rest (AES-256-GCM,
// AAD bound to user_id|item_id) and only ever decrypted in-process for a Plaid call.

import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { plaidItems } from "../db/schema";
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

export async function getUserItems(userId: string): Promise<PlaidItemRow[]> {
  return db.select().from(plaidItems).where(eq(plaidItems.userId, userId));
}

export async function getItemByItemId(
  itemId: string,
): Promise<PlaidItemRow | undefined> {
  return (
    await db.select().from(plaidItems).where(eq(plaidItems.itemId, itemId)).limit(1)
  )[0];
}

export async function userHasGoodItem(userId: string): Promise<boolean> {
  return (
    (
      await db
        .select({ id: plaidItems.id })
        .from(plaidItems)
        .where(and(eq(plaidItems.userId, userId), eq(plaidItems.status, "good")))
        .limit(1)
    ).length > 0
  );
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
