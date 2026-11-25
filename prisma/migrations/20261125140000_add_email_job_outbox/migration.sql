-- Persistent outbox for transactional background email delivery.
CREATE TABLE IF NOT EXISTS "email_jobs" (
  "id" BIGSERIAL PRIMARY KEY,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "locked_at" TIMESTAMPTZ,
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "sent_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "email_jobs_pending_idx"
  ON "email_jobs" ("status", "next_attempt_at", "created_at");

CREATE INDEX IF NOT EXISTS "email_jobs_processing_idx"
  ON "email_jobs" ("status", "locked_at");
