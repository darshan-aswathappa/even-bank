import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { config, mode } from "./config";

// Null in mock mode — services must guard on `mode === "live"` before using it.
export const plaidClient: PlaidApi | null =
  mode === "live"
    ? new PlaidApi(
        new Configuration({
          basePath:
            PlaidEnvironments[config.plaid.env] ?? PlaidEnvironments.sandbox,
          baseOptions: {
            headers: {
              "PLAID-CLIENT-ID": config.plaid.clientId,
              "PLAID-SECRET": config.plaid.secret,
            },
          },
        }),
      )
    : null;
