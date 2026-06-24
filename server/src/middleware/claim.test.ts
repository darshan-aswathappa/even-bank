// Security-critical test: claim-token resolution for the onboarding flow must
// FAIL-CLOSED (missing / unknown / expired token => 401) and, on success, bind
// the request to the pairing's user. Runs against the local Postgres from .env;
// creates and cleans up its own rows.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { db, pool } from "../db/client";
import { users, deviceAuth } from "../db/schema";
import { sha256, claimToken, randomToken } from "../crypto/tokens";
import { requireClaim } from "./claim";

let userId: string;
let daId: string;
const token = claimToken();
const expiredToken = claimToken();

beforeAll(async () => {
  const stamp = Date.now();
  userId = (await db.insert(users).values({}).returning())[0].id;

  // Valid, authorized, not-yet-expired pairing bound to the user.
  daId = (
    await db
      .insert(deviceAuth)
      .values({
        deviceCodeHash: sha256(randomToken()),
        userCode: `VALID${stamp}`.slice(0, 8),
        status: "authorized",
        userId,
        claimTokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      })
      .returning()
  )[0].id;

  // Expired pairing — must be rejected even though the token matches.
  await db.insert(deviceAuth).values({
    deviceCodeHash: sha256(randomToken()),
    userCode: `EXPIR${stamp}`.slice(0, 8),
    status: "authorized",
    userId,
    claimTokenHash: sha256(expiredToken),
    expiresAt: new Date(Date.now() - 1000),
  });
});

afterAll(async () => {
  await db.delete(deviceAuth).where(eq(deviceAuth.userId, userId));
  await db.delete(users).where(eq(users.id, userId)); // cascades any remainder
  await pool.end();
});

// Minimal Express req/res doubles capturing status + next().
function run(authHeader: string | undefined) {
  const req = {
    header: (name: string) =>
      name.toLowerCase() === "authorization" ? authHeader : undefined,
  } as unknown as Request;
  const result: { status?: number; nextCalled: boolean; req: Request } = {
    nextCalled: false,
    req,
  };
  const res = {
    status(code: number) {
      result.status = code;
      return { json: () => undefined };
    },
  } as unknown as Response;
  const next = () => {
    result.nextCalled = true;
  };
  return requireClaim(req, res, next).then(() => result);
}

describe("requireClaim (fail-closed)", () => {
  it("rejects a missing Authorization header", async () => {
    const r = await run(undefined);
    expect(r.status).toBe(401);
    expect(r.nextCalled).toBe(false);
  });

  it("rejects an unknown token", async () => {
    const r = await run(`Bearer ${claimToken()}`);
    expect(r.status).toBe(401);
    expect(r.nextCalled).toBe(false);
  });

  it("rejects an expired pairing", async () => {
    const r = await run(`Bearer ${expiredToken}`);
    expect(r.status).toBe(401);
    expect(r.nextCalled).toBe(false);
  });

  it("accepts a valid token and binds user + deviceAuth", async () => {
    const r = await run(`Bearer ${token}`);
    expect(r.nextCalled).toBe(true);
    expect(r.status).toBeUndefined();
    expect(r.req.userId).toBe(userId);
    expect(r.req.deviceAuthId).toBe(daId);
  });
});
