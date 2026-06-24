// Plaid webhook receiver. Verifies the ES256 JWT in the `Plaid-Verification`
// header AND that its request_body_sha256 claim matches the RAW body, then
// drives transaction sync / item-status updates. Mounted with a raw-body parser
// (see index.ts) because signature verification needs the exact bytes.

import { Router } from "express";
import { createHash } from "crypto";
import { plaidClient } from "../plaidClient";
import * as plaidService from "../services/plaidService";
import * as itemStore from "../services/itemStore";
import { logger } from "../logger";

export const webhookRouter = Router();

webhookRouter.post("/plaid/webhook", async (req, res) => {
  const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const verification = req.header("plaid-verification");

  try {
    if (!plaidClient || !verification) {
      res.status(401).end();
      return;
    }
    // jose is ESM-only; load it dynamically from this CommonJS module.
    const { importJWK, jwtVerify, decodeProtectedHeader } = await import("jose");
    const { kid, alg } = decodeProtectedHeader(verification);
    if (alg !== "ES256" || !kid) {
      res.status(401).end();
      return;
    }

    const keyResp = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
    const key = await importJWK(keyResp.data.key as Parameters<typeof importJWK>[0], "ES256");
    const { payload } = await jwtVerify(verification, key, { algorithms: ["ES256"] });

    const expected = createHash("sha256").update(raw).digest("hex");
    if (payload.request_body_sha256 !== expected) {
      res.status(401).end();
      return;
    }
    // Replay protection: reject stale signatures (>5 min).
    const iat = typeof payload.iat === "number" ? payload.iat : 0;
    if (Math.abs(Date.now() / 1000 - iat) > 300) {
      res.status(401).end();
      return;
    }
  } catch (err) {
    logger.warn({ err: String(err) }, "[webhook] signature verification failed");
    res.status(401).end();
    return;
  }

  // Verified — ack immediately, process asynchronously.
  res.json({ ok: true });
  handle(JSON.parse(raw.toString("utf8"))).catch((err) =>
    logger.error({ err: String(err) }, "[webhook] processing failed"),
  );
});

interface PlaidWebhookBody {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
}

async function handle(body: PlaidWebhookBody): Promise<void> {
  const { webhook_type, webhook_code, item_id } = body;
  if (!item_id) return;

  if (
    webhook_type === "TRANSACTIONS" &&
    (webhook_code === "SYNC_UPDATES_AVAILABLE" ||
      webhook_code === "INITIAL_UPDATE" ||
      webhook_code === "DEFAULT_UPDATE" ||
      webhook_code === "HISTORICAL_UPDATE")
  ) {
    await plaidService.syncItemTransactions(item_id);
    return;
  }

  if (webhook_type === "ITEM") {
    if (webhook_code === "ERROR" || webhook_code === "PENDING_EXPIRATION") {
      await itemStore.setStatus(item_id, "login_required");
    } else if (webhook_code === "LOGIN_REPAIRED") {
      await itemStore.setStatus(item_id, "good");
    }
  }
}
