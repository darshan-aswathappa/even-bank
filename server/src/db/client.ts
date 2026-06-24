import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../config";
import * as schema from "./schema";

// TLS to Postgres. Default: verify the server cert (secure). Local dev skips
// TLS. For providers that present a private CA, supply it via DATABASE_CA_CERT
// (verification stays ON). Set DATABASE_SSL=disable only for a trusted private
// network link (e.g. a same-region internal connection that doesn't use TLS).
const isLocal = /localhost|127\.0\.0\.1/.test(config.databaseUrl);
function resolveSsl(): false | { rejectUnauthorized: boolean; ca?: string } {
  const mode = (process.env.DATABASE_SSL ?? (isLocal ? "disable" : "verify")).toLowerCase();
  if (mode === "disable") return false;
  const ca = process.env.DATABASE_CA_CERT;
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true };
}

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: resolveSsl(),
});
export const db = drizzle(pool, { schema });
export type Db = typeof db;
