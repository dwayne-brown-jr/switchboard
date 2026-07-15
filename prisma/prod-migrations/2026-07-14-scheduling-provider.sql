-- Prod Turso migration: add Shop.schedulingProvider (scheduling provider seam).
-- Which calendar backs a shop's availability/bookings: null/"native" (default,
-- Switchboard's own scheduler) or an external provider id (e.g. "google").
-- Apply before deploying the seam:
--   turso db shell switchboard < prisma/prod-migrations/2026-07-14-scheduling-provider.sql
-- Additive & non-destructive.
ALTER TABLE "Shop" ADD COLUMN "schedulingProvider" TEXT;
