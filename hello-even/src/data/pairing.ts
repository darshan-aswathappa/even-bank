// Device-pairing client (RFC 8628). Requests a code, then polls until the user
// has authorized + linked on their phone, returning the device token.

import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "../config";

export interface PairingStart {
  userCode: string; // shown on the glasses for the user to type on their phone
  verificationUri: string;
  deviceCode: string; // secret — kept on the glasses, used to poll
  interval: number; // seconds between polls
  expiresIn: number; // seconds until the code expires
}

async function post(path: string, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function startPairing(): Promise<PairingStart> {
  const res = await post("/device/code", {});
  if (!res.ok) throw new Error(`device/code HTTP ${res.status}`);
  const d = await res.json();
  return {
    userCode: d.user_code,
    verificationUri: d.verification_uri,
    deviceCode: d.device_code,
    interval: d.interval ?? 5,
    expiresIn: d.expires_in ?? 600,
  };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Polls until linked (returns the device token), the code expires, or the user
// denies. Honors the server's poll interval.
export async function pollForToken(start: PairingStart): Promise<string> {
  const deadline = Date.now() + start.expiresIn * 1000;
  let interval = start.interval;

  while (Date.now() < deadline) {
    await delay(interval * 1000);
    const res = await post("/device/token", { device_code: start.deviceCode });
    if (res.ok) {
      const d = await res.json();
      if (d.device_token) return d.device_token as string;
    } else {
      const err = (await res.json().catch(() => ({}))).error;
      if (err === "slow_down") interval += 2;
      else if (err === "access_denied") throw new Error("pairing_denied");
      else if (err === "expired_token") throw new Error("pairing_expired");
      // "authorization_pending" -> keep polling
    }
  }
  throw new Error("pairing_expired");
}
