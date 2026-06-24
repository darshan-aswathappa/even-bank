import { describe, it, expect, beforeEach } from "vitest";
import { randomBytes } from "crypto";
import { encrypt, decrypt, aad, resetKeyCache } from "./encryption";

const KEK = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.KEK_BASE64 = KEK;
  delete process.env.KEK_BASE64_V2;
  resetKeyCache();
});

describe("encryption", () => {
  const token = "access-production-abc123-secret-token";
  const A = aad("user-A", "item-1");

  it("round-trips plaintext", () => {
    const rec = decrypt(encrypt(token, A), A);
    expect(rec).toBe(token);
  });

  it("produces a fresh IV each time (no deterministic ciphertext)", () => {
    const a = encrypt(token, A);
    const b = encrypt(token, A);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it("fails to decrypt with the wrong AAD (ciphertext swap defense)", () => {
    const rec = encrypt(token, aad("user-A", "item-1"));
    expect(() => decrypt(rec, aad("user-B", "item-1"))).toThrow();
  });

  it("fails to decrypt tampered ciphertext", () => {
    const rec = encrypt(token, A);
    rec.ciphertext[0] ^= 0xff;
    expect(() => decrypt(rec, A)).toThrow();
  });

  it("fails to decrypt with a tampered auth tag", () => {
    const rec = encrypt(token, A);
    rec.authTag[0] ^= 0xff;
    expect(() => decrypt(rec, A)).toThrow();
  });

  it("fails when the key for the record's keyId is missing", () => {
    const rec = encrypt(token, A);
    delete process.env.KEK_BASE64;
    resetKeyCache();
    expect(() => decrypt(rec, A)).toThrow(/No encryption key/);
  });

  it("rejects a KEK that is not 32 bytes", () => {
    process.env.KEK_BASE64 = Buffer.from("too-short").toString("base64");
    resetKeyCache();
    expect(() => encrypt(token, A)).toThrow(/32 bytes/);
  });
});
