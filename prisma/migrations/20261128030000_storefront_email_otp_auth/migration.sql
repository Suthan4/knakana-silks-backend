-- BACK UP THE PRODUCTION DATABASE BEFORE APPLYING THIS MIGRATION.
CREATE TYPE "EmailSuppressionReason" AS ENUM ('BOUNCE','COMPLAINT');
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "emailNormalized" TEXT;
-- Existing customer rows are backfilled using the same Gmail-specific canonicalisation
-- as email-policy.service.ts. Review collisions before creating the unique index.
UPDATE "users" SET "emailNormalized" =
 CASE WHEN lower(split_part(trim("email"), '@', 2)) IN ('gmail.com','googlemail.com')
 THEN regexp_replace(split_part(lower(trim("email")), '@', 1), '\\.', '', 'g') || '@gmail.com'
 ELSE lower(trim("email")) END;
ALTER TABLE "users" ALTER COLUMN "emailNormalized" SET NOT NULL;
CREATE UNIQUE INDEX "users_emailNormalized_key" ON "users"("emailNormalized");
ALTER TABLE "refresh_tokens" RENAME COLUMN "token" TO "tokenHash";
ALTER TABLE "refresh_tokens" ADD COLUMN "familyId" UUID;
UPDATE "refresh_tokens" SET "familyId" = gen_random_uuid();
ALTER TABLE "refresh_tokens" ALTER COLUMN "familyId" SET NOT NULL;
ALTER TABLE "refresh_tokens" ADD COLUMN "rotatedAt" TIMESTAMP(3);
ALTER TABLE "refresh_tokens" ADD COLUMN "revokedAt" TIMESTAMP(3);
DROP INDEX IF EXISTS "refresh_tokens_token_idx";
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");
CREATE TABLE "email_suppressions" ("id" BIGSERIAL PRIMARY KEY,"email" TEXT NOT NULL UNIQUE,"reason" "EmailSuppressionReason" NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "auth_events" ("id" BIGSERIAL PRIMARY KEY,"userId" BIGINT,"emailHash" TEXT NOT NULL,"event" TEXT NOT NULL,"ip" TEXT,"userAgent" TEXT,"result" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "auth_events_createdAt_idx" ON "auth_events"("createdAt");
CREATE INDEX "auth_events_emailHash_idx" ON "auth_events"("emailHash");
CREATE TABLE "blocklist" ("id" BIGSERIAL PRIMARY KEY,"type" TEXT NOT NULL,"value" TEXT NOT NULL UNIQUE,"reason" TEXT,"isActive" BOOLEAN NOT NULL DEFAULT TRUE,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "risk_events" ("id" BIGSERIAL PRIMARY KEY,"userId" BIGINT,"rule" TEXT NOT NULL,"decision" TEXT NOT NULL,"orderDraft" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "risk_events_createdAt_idx" ON "risk_events"("createdAt");
CREATE INDEX "risk_events_rule_idx" ON "risk_events"("rule");
