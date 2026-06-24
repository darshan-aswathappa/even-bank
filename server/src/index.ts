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
import { linkRouter } from "./routes/link";
import { onboardingRouter } from "./routes/onboarding";
import { deviceAuthRouter } from "./routes/deviceAuth";
import { authRouter } from "./routes/auth";
import { webhookRouter } from "./routes/webhook";

const app = express();
app.set("trust proxy", 1); // correct client IP behind a managed-platform proxy

app.use(helmet());
app.use(pinoHttp({ logger }));

// Pinned CORS (never "*"); credentials enabled for the onboarding session cookie.
app.use(
  cors({
    origin: config.allowedOrigins.length ? config.allowedOrigins : false,
    credentials: true,
  }),
);

// Webhook signature verification needs the RAW body — mount before express.json.
app.use("/api/plaid/webhook", express.raw({ type: "*/*" }), webhookRouter);

app.use(express.json({ limit: "100kb" }));

// Rate limiters (in-memory; use a shared store like Redis for multi-instance).
const pairingLimiter = rateLimit({ windowMs: 60_000, limit: 30 });
const authLimiter = rateLimit({ windowMs: 60_000, limit: 10 });

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

// Public onboarding page + Plaid Link endpoints (link is session-protected internally).
app.use(onboardingRouter);
app.use("/api", pairingLimiter, deviceAuthRouter);
app.use("/api", authLimiter, authRouter);
app.use("/api", linkRouter);

// Glasses data endpoints — device-token auth, per-user.
app.use("/api", requireDevice, balancesRouter);
app.use("/api", requireDevice, transactionsRouter);

app.listen(config.port, () => {
  logger.info(
    { port: config.port, mode },
    `even-bank-server listening (mode: ${mode.toUpperCase()})`,
  );
});
