ALTER TABLE "login_tokens" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "login_tokens" CASCADE;--> statement-breakpoint
DROP INDEX "users_email_unique";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "device_auth" ADD COLUMN "claim_token_hash" "bytea";--> statement-breakpoint
CREATE UNIQUE INDEX "device_auth_claim_hash_unique" ON "device_auth" USING btree ("claim_token_hash");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email_verified";