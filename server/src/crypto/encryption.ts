// AES-256-GCM encryption for Plaid access tokens at rest.
//
// - The KEK (key-encryption key) lives only in the platform secret manager
//   (env KEK_BASE64), never in the DB or logs.
// - Each ciphertext is bound to its owner via AAD = "user_id|item_id", so a
//   row copied to another user fails authentication (defeats ciphertext swaps).
// - `keyId` is stored per record so the KEK can be rotated lazily (add a new
//   key version, re-encrypt on next access, retire the old once unreferenced).

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const CURRENT_KEY_ID = "kek-v1";

export interface EncryptedRecord {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyId: string;
}

// Map of keyId -> 32-byte key. Supports multiple versions during rotation.
// Extend with KEK_BASE64_V2 etc. when rotating; keep old versions until no rows
// reference them.
function loadKeys(): Map<string, Buffer> {
  const keys = new Map<string, Buffer>();
  const primary = process.env.KEK_BASE64?.trim();
  if (primary) keys.set(CURRENT_KEY_ID, decodeKey(primary, "KEK_BASE64"));
  const v2 = process.env.KEK_BASE64_V2?.trim();
  if (v2) keys.set("kek-v2", decodeKey(v2, "KEK_BASE64_V2"));
  return keys;
}

function decodeKey(b64: string, name: string): Buffer {
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(`${name} must decode to 32 bytes (got ${key.length}).`);
  }
  return key;
}

let cachedKeys: Map<string, Buffer> | null = null;
function keyFor(keyId: string): Buffer {
  if (!cachedKeys) cachedKeys = loadKeys();
  const key = cachedKeys.get(keyId);
  if (!key) throw new Error(`No encryption key configured for keyId "${keyId}".`);
  return key;
}

// Test/rotation hook so callers can reset the cache after changing env.
export function resetKeyCache(): void {
  cachedKeys = null;
}

export function aad(userId: string, itemId: string): Buffer {
  return Buffer.from(`${userId}|${itemId}`, "utf8");
}

export function encrypt(plaintext: string, aadBuf: Buffer): EncryptedRecord {
  const keyId = CURRENT_KEY_ID;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, keyFor(keyId), iv);
  cipher.setAAD(aadBuf);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag(), keyId };
}

export function decrypt(record: EncryptedRecord, aadBuf: Buffer): string {
  const decipher = createDecipheriv(ALGO, keyFor(record.keyId), record.iv);
  decipher.setAAD(aadBuf);
  decipher.setAuthTag(record.authTag);
  // Throws "Unsupported state or unable to authenticate data" on tampering,
  // wrong key, or wrong AAD — callers must treat that as a hard failure.
  return Buffer.concat([decipher.update(record.ciphertext), decipher.final()]).toString("utf8");
}
