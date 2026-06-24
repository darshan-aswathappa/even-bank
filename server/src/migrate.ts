// Production migration runner. Applies the committed SQL in ./migrations using
// drizzle-orm's migrator (no drizzle-kit / dev deps needed), so it runs inside
// the lean Docker image as a pre-deploy/release step: `node dist/migrate.js`.

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pool } from "./db/client";

async function main(): Promise<void> {
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./migrations" });
  await pool.end();
  console.log("[migrate] migrations applied");
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
