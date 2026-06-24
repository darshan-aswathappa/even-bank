// Security-critical tests: device-token auth resolution (fail-closed) and
// per-user data isolation (IDOR). Runs against the local Postgres from .env;
// creates and cleans up its own rows.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "./client";
import { users, devices, transactions } from "./schema";
import { sha256, deviceToken } from "../crypto/tokens";
import { findActiveDeviceByToken } from "./queries";

let userAId: string;
let userBId: string;
let userATokenVersion: number;
let devAId: string;
const tokenA = deviceToken();
const tokenB = deviceToken();

beforeAll(async () => {
  const stamp = Date.now();
  const [a] = await db
    .insert(users)
    .values({ email: `a+${stamp}@test.local`, emailVerified: true })
    .returning();
  const [b] = await db
    .insert(users)
    .values({ email: `b+${stamp}@test.local`, emailVerified: true })
    .returning();
  userAId = a.id;
  userBId = b.id;
  userATokenVersion = a.tokenVersion;

  const [da] = await db
    .insert(devices)
    .values({ userId: a.id, tokenHash: sha256(tokenA), tokenVersion: a.tokenVersion })
    .returning();
  devAId = da.id;
  await db
    .insert(devices)
    .values({ userId: b.id, tokenHash: sha256(tokenB), tokenVersion: b.tokenVersion });

  await db.insert(transactions).values([
    { id: `tA-${stamp}`, userId: a.id, itemId: "itA", accountId: "acA", name: "A spend", merchant: null, amount: -1, isoDate: "2026-06-01", pending: false, category: null },
    { id: `tB-${stamp}`, userId: b.id, itemId: "itB", accountId: "acB", name: "B spend", merchant: null, amount: -2, isoDate: "2026-06-02", pending: false, category: null },
  ]);
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userAId)); // cascades devices + transactions
  await db.delete(users).where(eq(users.id, userBId));
  await pool.end();
});

describe("device-token auth (fail-closed)", () => {
  it("resolves a valid token to its own user", async () => {
    expect((await findActiveDeviceByToken(tokenA))?.userId).toBe(userAId);
    expect((await findActiveDeviceByToken(tokenB))?.userId).toBe(userBId);
  });

  it("rejects unknown tokens", async () => {
    expect(await findActiveDeviceByToken("dt_does_not_exist")).toBeNull();
  });

  it("rejects revoked devices", async () => {
    await db.update(devices).set({ revokedAt: new Date() }).where(eq(devices.id, devAId));
    expect(await findActiveDeviceByToken(tokenA)).toBeNull();
    await db.update(devices).set({ revokedAt: null }).where(eq(devices.id, devAId));
  });

  it("rejects all devices when the user's token_version is bumped (revoke-all)", async () => {
    await db.update(users).set({ tokenVersion: 999 }).where(eq(users.id, userAId));
    expect(await findActiveDeviceByToken(tokenA)).toBeNull();
    await db.update(users).set({ tokenVersion: userATokenVersion }).where(eq(users.id, userAId));
    expect((await findActiveDeviceByToken(tokenA))?.userId).toBe(userAId);
  });
});

describe("per-user transaction isolation (IDOR)", () => {
  it("a user-scoped query returns only that user's rows", async () => {
    const aRows = await db.select().from(transactions).where(eq(transactions.userId, userAId));
    expect(aRows.length).toBeGreaterThan(0);
    expect(aRows.every((r) => r.userId === userAId)).toBe(true);
    expect(aRows.some((r) => r.userId === userBId)).toBe(false);
  });
});
