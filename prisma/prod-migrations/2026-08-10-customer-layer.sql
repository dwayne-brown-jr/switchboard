-- Prod Turso migration: the customer layer (CRM). See docs/CRM-PLAN.md.
-- Apply to prod BEFORE/at deploy of the customer-layer change:
--   turso db shell switchboard < prisma/prod-migrations/2026-08-10-customer-layer.sql
--
-- Additive & non-destructive. No existing row is rewritten and no existing
-- table is dropped.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS HAND-WRITTEN AND NOT `prisma migrate diff` OUTPUT
-- ---------------------------------------------------------------------------
-- SQLite cannot add a FOREIGN KEY constraint to an existing table in place. Ask
-- Prisma to generate this diff and it emits its "RedefineTables" strategy for
-- CallRecord and Booking:
--
--     CREATE TABLE "new_CallRecord" (...);
--     INSERT INTO "new_CallRecord" SELECT ... FROM "CallRecord";
--     DROP TABLE "CallRecord";
--     ALTER TABLE "new_CallRecord" RENAME TO "CallRecord";
--
-- That is a full copy-and-drop of the live call-recording table — the one table
-- whose loss is unrecoverable, on a database taking production traffic, with no
-- transaction wrapping it in the Turso shell. The upside would be DB-level
-- enforcement of three nullable FKs. That is a bad trade.
--
-- So the two ALTERs below add the columns WITHOUT the FK constraints. What we
-- give up is only database-level referential enforcement; what still works:
--   * Prisma Client relations/joins — these are generated from schema.prisma,
--     not read from the DB's constraint table, so `include: { customer: true }`
--     behaves identically.
--   * onDelete: SetNull — the app never hard-deletes a Customer today. If that
--     changes, the delete path must null these columns itself.
--
-- KNOWN DRIFT: `prisma db push` in dev DOES do the table rebuild, so dev has
-- the FK constraints and prod does not. This is intentional and is the only
-- difference between the two. Revisit if/when there's a maintenance window
-- worth spending on a CallRecord rebuild.
-- ---------------------------------------------------------------------------

-- === New tables ============================================================

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "displayName" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "notes" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'lead',
    "source" TEXT NOT NULL DEFAULT 'agent',
    "smsConsentAt" DATETIME,
    "smsOptOut" BOOLEAN NOT NULL DEFAULT false,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastContactAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "bookingCount" INTEGER NOT NULL DEFAULT 0,
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "lifetimeValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Customer_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Customer_shopId_lastContactAt_idx" ON "Customer"("shopId", "lastContactAt");
CREATE INDEX "Customer_shopId_stage_idx" ON "Customer"("shopId", "stage");

-- The identity-resolution table. The UNIQUE index below is the whole mechanism:
-- ingest upserts against it, so the mid-call create_booking path and the
-- post-call webhook converge on one Customer no matter which arrives first.
-- It is tenant-scoped, so two shops can each have their own record of the same
-- caller without colliding.
CREATE TABLE "CustomerPhone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerPhone_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomerPhone_shopId_phoneE164_key" ON "CustomerPhone"("shopId", "phoneE164");
CREATE INDEX "CustomerPhone_customerId_idx" ON "CustomerPhone"("customerId");

CREATE TABLE "CustomerAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "attrs" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerAsset_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CustomerAsset_customerId_idx" ON "CustomerAsset"("customerId");

CREATE TABLE "CustomerTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    CONSTRAINT "CustomerTag_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomerTag_customerId_label_key" ON "CustomerTag"("customerId", "label");
CREATE INDEX "CustomerTag_label_idx" ON "CustomerTag"("label");

CREATE TABLE "CustomerEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT,
    "detail" JSONB,
    "actorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CustomerEvent_customerId_createdAt_idx" ON "CustomerEvent"("customerId", "createdAt");

-- Follow-up engine (Phase D). Tables land now so the layer is complete; nothing
-- writes to them yet, and FollowUpRule.enabled defaults to 0 so no outbound
-- message can fire before the A2P work in docs/CRM-PLAN.md §5 is done.
CREATE TABLE "FollowUpRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "delayHours" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowUpRule_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "FollowUpRule_shopId_trigger_idx" ON "FollowUpRule"("shopId", "trigger");

CREATE TABLE "FollowUpTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "ruleId" TEXT,
    "callId" TEXT,
    "dueAt" DATETIME NOT NULL,
    "channel" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowUpTask_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "FollowUpTask_shopId_status_dueAt_idx" ON "FollowUpTask"("shopId", "status", "dueAt");
CREATE INDEX "FollowUpTask_customerId_idx" ON "FollowUpTask"("customerId");

-- === Existing tables: nullable columns only, no rebuild ====================
-- See the header. These are plain ADD COLUMNs; SQLite does them as metadata
-- updates without touching existing rows.

ALTER TABLE "CallRecord" ADD COLUMN "customerId" TEXT;
CREATE INDEX "CallRecord_customerId_timestamp_idx" ON "CallRecord"("customerId", "timestamp");

ALTER TABLE "Booking" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "assetId" TEXT;
-- ACTUAL job value in CENTS once work is completed. Distinct from the
-- ESTIMATE in CallRecord.estJobValue, which is whole dollars. lib/customer.ts
-- owns the single conversion between the two units.
ALTER TABLE "Booking" ADD COLUMN "valueCents" INTEGER;
CREATE INDEX "Booking_customerId_idx" ON "Booking"("customerId");

-- === After applying =========================================================
-- Run the backfill to populate customers from existing call/booking history:
--   node scripts/backfill-customers.mjs --dry     # report, writes nothing
--   node scripts/backfill-customers.mjs           # apply
-- It is idempotent — running it twice is a no-op.
--
-- APPLIED TO PROD 2026-08-13 (switchboard-db28319496.aws-us-west-2.turso.io).
-- Verified: 7 tables + 4 columns + the UNIQUE index created; CallRecord (97)
-- and Booking (1) row counts unchanged. Backfill created 93 customers, linked
-- 97/97 calls and 1/1 booking, 100% phone normalization, 0 unlinkable; a second
-- run created 0 (idempotency confirmed).
