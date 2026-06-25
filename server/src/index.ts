import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { config, mode } from "./config";
import { logger } from "./logger";
import { pool } from "./db/client";
import { requireDevice } from "./middleware/auth";
import { balancesRouter } from "./routes/balances";
import { transactionsRouter } from "./routes/transactions";
import { recurringRouter } from "./routes/recurring";
import { linkRouter } from "./routes/link";
import { onboardingRouter } from "./routes/onboarding";
import { deviceAuthRouter } from "./routes/deviceAuth";
import { webhookRouter } from "./routes/webhook";

const app = express();
app.set("trust proxy", 1); // correct client IP behind a managed-platform proxy

// CSP tuned for the onboarding page: its own script is external ('self'), and
// Plaid Link loads/embeds from cdn.plaid.com. API responses are JSON (CSP n/a).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "https://cdn.plaid.com"],
        "frame-src": ["'self'", "https://cdn.plaid.com", "https://*.plaid.com"],
        "connect-src": ["'self'", "https://*.plaid.com"],
        "img-src": ["'self'", "data:"],
      },
    },
  }),
);
app.use(pinoHttp({ logger }));

// Pinned CORS (never "*"). Auth is via Bearer tokens (device + claim), not
// cookies, so credentials are not needed.
app.use(
  cors({
    origin: config.allowedOrigins.length ? config.allowedOrigins : false,
  }),
);

// Webhook signature verification needs the RAW body — mount before express.json.
app.use("/api/plaid/webhook", express.raw({ type: "*/*" }), webhookRouter);

app.use(express.json({ limit: "100kb" }));

// Rate limiter (in-memory; use a shared store like Redis for multi-instance).
const pairingLimiter = rateLimit({ windowMs: 60_000, limit: 30 });

app.get("/health", (_req, res) => {
  res.json({ ok: true, mode });
});
app.get("/ready", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

// Public onboarding page + pairing/claim endpoints + Plaid Link (link is
// claim-token-protected internally).
app.use(onboardingRouter);
app.use("/api", pairingLimiter, deviceAuthRouter);
app.use("/api", linkRouter);

// Glasses data endpoints — device-token auth, per-user.
app.use("/api", requireDevice, balancesRouter);
app.use("/api", requireDevice, transactionsRouter);
app.use("/api", requireDevice, recurringRouter);

// Central error handler: logs the real error and returns JSON (not HTML).
app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error(
      { err: err instanceof Error ? err.stack : String(err), path: req.path },
      "unhandled route error",
    );
    if (!res.headersSent) res.status(500).json({ error: "internal_error" });
  },
);

app.listen(config.port, () => {
  logger.info(
    { port: config.port, mode },
    `even-bank-server listening (mode: ${mode.toUpperCase()})`,
  );
});
