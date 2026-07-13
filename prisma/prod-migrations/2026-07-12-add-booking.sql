-- Prod Turso migration: add the Booking table (Switchboard now owns scheduling).
-- Apply to prod BEFORE/at deploy of the owned-scheduling change:
--   turso db shell switchboard < prisma/prod-migrations/2026-07-12-add-booking.sql
-- Additive & non-destructive (no existing table/column touched).

CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "startUtc" DATETIME NOT NULL,
    "endUtc" DATETIME NOT NULL,
    "service" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "source" TEXT NOT NULL DEFAULT 'agent',
    "callId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Booking_shopId_startUtc_idx" ON "Booking"("shopId", "startUtc");
