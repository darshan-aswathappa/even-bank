// Structured logger with redaction of anything sensitive. NEVER log raw tokens,
// Plaid responses, or Authorization headers.

import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.access_token",
      "*.public_token",
      "*.device_code",
      "*.token",
      "*.secret",
      "password",
    ],
    censor: "[redacted]",
  },
});
