// Runtime configuration, sourced from Vite env vars (see .env.example).
// In dev, VITE_API_BASE_URL points at "/api" which the Vite proxy forwards to
// the backend (avoids CORS). In a packaged build it's the real backend origin
// (which must be whitelisted in app.json and send CORS headers).

const env = import.meta.env;

// Dev mode (VITE_DEV_MODE=true): serve dummy data from data/fixtures.ts and skip
// pairing entirely, so the UI lands straight on the Balance screen with content.
// Lets you iterate on screens without a backend, device token, or real bank link.
export const DEV_MODE = (env.VITE_DEV_MODE ?? "false") === "true";

export const API_BASE_URL = (env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");
// Live Plaid calls (especially a transactions sync right after linking) can take
// well over 5s, so allow generous headroom before aborting a request.
export const REQUEST_TIMEOUT_MS = 12_000;

// Right after pairing, poll a few times quickly so balances appear promptly
// instead of waiting for the next steady-state refresh tick.
export const POST_PAIR_RETRIES = 6;
export const POST_PAIR_RETRY_MS = 4_000;
