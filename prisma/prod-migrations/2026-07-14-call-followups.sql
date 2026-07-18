-- Prod Turso migration: call summaries/transcripts + owner follow-up state.
-- Apply to prod BEFORE/at deploy of the mobile follow-up change:
--   turso db shell switchboard < prisma/prod-migrations/2026-07-14-call-followups.sql
-- Additive & non-destructive (no existing table/column touched).

ALTER TABLE "CallRecord" ADD COLUMN "summary" TEXT;
ALTER TABLE "CallRecord" ADD COLUMN "transcript" TEXT;
ALTER TABLE "CallRecord" ADD COLUMN "handledAt" DATETIME;
