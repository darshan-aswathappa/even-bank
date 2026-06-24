import "dotenv/config";
import type { Mode } from "./types";

function env(key: string, fallback = ""): string {
  return (process.env[key] ?? fallback).trim();
}

function list(key: string): string[] {
  return env(key)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(env("PORT", "8787")),
  // Public HTTPS origin of THIS backend (used for magic-link URLs + Plaid webhook).
  publicBaseUrl: env("PUBLIC_BASE_URL", "http://localhost:8787"),
  // Explicit allowed CORS origins (glasses app origin + onboarding origin). Never "*".
  allowedOrigins: list("ALLOWED_ORIGINS"),

  databaseUrl: env("DATABASE_URL"),
  // 32-byte key, base64-encoded, from the platform secret manager. Encrypts Plaid tokens.
  kekBase64: env("KEK_BASE64"),
  // Secret for the iron-session onboarding cookie (>= 32 chars).
  sessionSecret: env("SESSION_SECRET"),

  plaid: {
    clientId: env("PLAID_CLIENT_ID"),
    secret: env("PLAID_SECRET"),
    env: env("PLAID_ENV", "sandbox"),
    products: list("PLAID_PRODUCTS").length ? list("PLAID_PRODUCTS") : ["transactions"],
    countryCodes: list("PLAID_COUNTRY_CODES").length ? list("PLAID_COUNTRY_CODES") : ["US"],
  },

  email: {
    resendApiKey: env("RESEND_API_KEY"),
    from: env("EMAIL_FROM", "Even Bank <onboarding@example.com>"),
  },
};

const forceMock = env("USE_MOCK").toLowerCase() === "true";

// Live only when Plaid credentials are present and mock isn't forced.
export const mode: Mode =
  !forceMock && config.plaid.clientId && config.plaid.secret ? "live" : "mock";
