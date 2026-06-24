// Device-token authentication for the glasses client. FAIL-CLOSED: any missing,
// malformed, unknown, revoked, or version-mismatched token => 401. (Replaces
// the old shared-API-key middleware, which failed OPEN when unset.)

import type { Request, Response, NextFunction } from "express";
import { findActiveDeviceByToken, touchDevice } from "../db/queries";

export async function requireDevice(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const device = await findActiveDeviceByToken(token);
  if (!device) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  req.userId = device.userId;
  req.deviceId = device.deviceId;
  void touchDevice(device.deviceId); // fire-and-forget last_seen update
  next();
}
