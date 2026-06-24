import { Router } from "express";
import { mode } from "../config";
import * as mockService from "../services/mockService";
import * as plaidService from "../services/plaidService";
import { type BalancesResponse, HttpError } from "../types";

// GET /api/balances -> the authenticated user's accounts (requireDevice upstream).
export const balancesRouter = Router();

balancesRouter.get("/balances", async (req, res) => {
  try {
    const accounts =
      mode === "live"
        ? await plaidService.fetchBalances(req.userId!)
        : mockService.getBalances();
    const body: BalancesResponse = { mode, accounts };
    res.json(body);
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code });
      return;
    }
    console.error("[balances] error:", err);
    res.status(502).json({ error: "upstream_error" });
  }
});
