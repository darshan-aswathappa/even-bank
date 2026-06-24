// Shared data-access helpers (typed Drizzle queries). Keeping the device-token
// lookup here so the auth middleware and tests share one implementation.

import { eq } from "drizzle-orm";
import { db } from "./client";
import { devices, users } from "./schema";
import { sha256 } from "../crypto/tokens";

export interface ActiveDevice {
  deviceId: string;
  userId: string;
}

// Resolve a Bearer device token to an active device+user, or null. Enforces:
// token-hash match, device not revoked, user active, and the device's
// token_version still matches the user's (so bumping users.token_version
// revokes all devices at once). Fail-closed: any mismatch returns null.
export async function findActiveDeviceByToken(
  token: string,
): Promise<ActiveDevice | null> {
  const hash = sha256(token);
  const rows = await db
    .select({
      deviceId: devices.id,
      userId: devices.userId,
      deviceTokenVersion: devices.tokenVersion,
      revokedAt: devices.revokedAt,
      userTokenVersion: users.tokenVersion,
      userStatus: users.status,
    })
    .from(devices)
    .innerJoin(users, eq(devices.userId, users.id))
    .where(eq(devices.tokenHash, hash))
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  if (r.revokedAt) return null;
  if (r.userStatus !== "active") return null;
  if (r.deviceTokenVersion !== r.userTokenVersion) return null;
  return { deviceId: r.deviceId, userId: r.userId };
}

export async function touchDevice(deviceId: string): Promise<void> {
  await db
    .update(devices)
    .set({ lastSeenAt: new Date() })
    .where(eq(devices.id, deviceId));
}
