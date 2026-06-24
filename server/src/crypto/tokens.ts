// Token + code generation and hashing. Secrets are returned to the caller once
// and only their SHA-256 hash is ever persisted.

import { randomBytes, createHash } from "crypto";

export function sha256(input: string): Buffer {
  return createHash("sha256").update(input, "utf8").digest();
}

// High-entropy opaque secret (256-bit), URL-safe. Used for device tokens,
// device codes, and claim tokens.
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function deviceToken(): string {
  return `dt_${randomToken(32)}`;
}

// Phone-side credential for the brief Plaid-linking window, issued when the
// onboarding page claims a user_code. Only its SHA-256 hash is persisted.
export function claimToken(): string {
  return `cl_${randomToken(32)}`;
}

// Crockford base32 (no I, L, O, U) — unambiguous for humans to read off the
// glasses and type on the phone. 8 chars => 32^8 ≈ 1.1e12 space.
// Canonical form is 8 chars (no dash); we store canonical and display dashed.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateUserCode(): string {
  const b = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += CROCKFORD[b[i] % 32];
  return s; // canonical, e.g. "7Q2XA9KP"
}

export function formatUserCode(canonical: string): string {
  return `${canonical.slice(0, 4)}-${canonical.slice(4, 8)}`; // "7Q2X-A9KP"
}

export function normalizeUserCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
}
