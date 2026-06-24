// Encrypted, signed cookie session for the PHONE onboarding flow only
// (iron-session). This session never reaches the glasses — the glasses use a
// device token instead.

import { getIronSession, type IronSession } from "iron-session";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config";

export interface SessionData {
  userId?: string;
  deviceAuthId?: string; // the pairing being completed in this session
}

const sessionOptions = {
  password: config.sessionSecret,
  cookieName: "evenbank_session",
  cookieOptions: {
    httpOnly: true,
    secure: config.publicBaseUrl.startsWith("https"),
    sameSite: "lax" as const,
    maxAge: 60 * 30, // 30 min
  },
};

export function getSession(
  req: Request,
  res: Response,
): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(req, res, sessionOptions);
}

// Gate phone-only endpoints (Plaid link/exchange, device approve).
export async function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const session = await getSession(req, res);
  if (!session.userId) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  req.userId = session.userId;
  next();
}
