import { Router } from "express";
import { mode } from "../config";
import * as mockService from "../services/mockService";
import * as plaidService from "../services/plaidService";
import { type RecurringResponse, HttpError } from "../types";

// GET /api/recurring -> the authenticated user's recurring outflow streams.
export const recurringRouter = Router();

recurringRouter.get("/recurring", async (req, res) => {
  try {
    const outflow =
      mode === "live"
        ? await plaidService.fetchRecurring(req.userId!)
        : mockService.getRecurring();
    const body: RecurringResponse = { mode, outflow };
    res.json(body);
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code });
      return;
    }
    console.error("[recurring] error:", err);
    res.status(502).json({ error: "upstream_error" });
  }
});
