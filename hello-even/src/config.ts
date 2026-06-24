// Runtime configuration, sourced from Vite env vars (see .env.example).
// In dev, VITE_API_BASE_URL points at "/api" which the Vite proxy forwards to
// the backend (avoids CORS). In a packaged build it's the real backend origin
// (which must be whitelisted in app.json and send CORS headers).

const env = import.meta.env;

export const API_BASE_URL = (env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");
export const REFRESH_MS = Number(env.VITE_REFRESH_MS ?? 60_000);
export const REQUEST_TIMEOUT_MS = 5_000;
