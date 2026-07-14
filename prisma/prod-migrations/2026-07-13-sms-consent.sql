-- Prod Turso migration: SMS consent + STOP/HELP opt-out fields on Shop.
-- Apply to prod BEFORE/at deploy of the SMS-consent change:
--   turso db shell switchboard < prisma/prod-migrations/2026-07-13-sms-consent.sql
-- Additive & non-destructive (no existing table/column touched).

ALTER TABLE "Shop" ADD COLUMN "a2pMessagingServiceSid" TEXT;
ALTER TABLE "Shop" ADD COLUMN "smsConsentAt" DATETIME;
ALTER TABLE "Shop" ADD COLUMN "smsOptOut" BOOLEAN NOT NULL DEFAULT false;
