# Switchboard — Customer Layer (CRM) Technical Plan

**Status:** Phase A shipped 2026-08-10. Phases B–E open.
**Written:** 2026-08-10

---

## 0. The thesis

Switchboard already captures the most valuable data stream in the trades: every inbound
call, with caller phone, intent, service, transcript, AI summary, estimated value, and
booking outcome. It then throws the *relationship* away.

Today the data model is **event-shaped**: `CallRecord` and `Booking` are flat rows keyed
to a `Shop`. There is no entity representing *the person who called*. Two calls from the
same customer six months apart are two unrelated rows.

This plan adds the missing spine — a `Customer` — and hangs everything off it. That single
change unlocks, in order of value:

1. **Returning-caller recognition by the agent itself.** "Hi Dwayne — is this about the
   Silverado again?" No competitor at this price point does this. It is not a CRM tab, it
   is a product differentiator that shows up in the first 5 seconds of a phone call.
2. **Recovery of unbooked calls.** A shop that takes 200 calls/mo and books 90 has 110
   warm leads it currently cannot see, let alone contact.
3. **Lifetime value and repeat rate** — the numbers that justify the subscription at
   renewal.

Non-goal: becoming ServiceTitan. This is the relationship layer around the phone call,
not a field-service management suite.

---

## 1. Data model

### 1.1 `Customer` — the spine

```prisma
model Customer {
  id           String   @id @default(cuid())
  shopId       String
  shop         Shop     @relation(fields: [shopId], references: [id])

  displayName  String?          // what the agent/owner sees; best-known name
  firstName    String?
  lastName     String?
  email        String?
  addressLine  String?
  city         String?
  postalCode   String?
  notes        String?          // freeform owner notes

  stage        String   @default("lead")   // lead | active | dormant | lost
  source       String   @default("agent")  // agent | manual | import

  // Customer-directed messaging consent. SEPARATE from Shop.smsOptOut, which is
  // about texting the OWNER. See §5 — this is a compliance boundary, not a flag.
  smsConsentAt DateTime?
  smsOptOut    Boolean  @default(false)
  doNotContact Boolean  @default(false)

  // Denormalized rollups — recomputed on write, not on read (see §3.3).
  firstSeenAt      DateTime @default(now())
  lastContactAt    DateTime @default(now())
  callCount        Int      @default(0)
  bookingCount     Int      @default(0)
  noShowCount      Int      @default(0)
  lifetimeValue    Int      @default(0)  // dollars, matching CallRecord.estJobValue units

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  phones    CustomerPhone[]
  assets    CustomerAsset[]
  tags      CustomerTag[]
  events    CustomerEvent[]
  calls     CallRecord[]
  bookings  Booking[]
  followUps FollowUpTask[]

  @@index([shopId, lastContactAt])
  @@index([shopId, stage])
}
```

### 1.2 `CustomerPhone` — identity resolution

Deliberately a child table rather than a `phone` column on `Customer`. Shops routinely
have one customer calling from a cell, a work line, and a spouse's phone. A child table
makes multi-number and merge work correctly from day one; a column would need a painful
migration later.

```prisma
model CustomerPhone {
  id         String   @id @default(cuid())
  shopId     String                    // denormalized so the unique index can be shop-scoped
  customerId String
  customer   Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  phoneE164  String
  isPrimary  Boolean  @default(false)
  createdAt  DateTime @default(now())

  @@unique([shopId, phoneE164])   // one number → one customer, per shop. Tenant-scoped.
  @@index([customerId])
}
```

**The `@@unique([shopId, phoneE164])` is the whole identity mechanism.** Resolution is a
single indexed lookup; the unique constraint makes concurrent ingest safe via upsert.

**Tradeoff accepted:** one extra join on every customer lookup. At the scale in question
(hundreds of calls/month/shop) this is free, and it buys correct merge semantics.

### 1.3 `CustomerAsset` — the thing being serviced

Verticals differ (vehicle vs. property vs. equipment) but the shape does not. One
polymorphic table beats six vertical-specific ones.

```prisma
model CustomerAsset {
  id         String   @id @default(cuid())
  customerId String
  customer   Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  kind       String   // vehicle | property | equipment
  label      String   // "2018 Silverado" / "412 Oak St" / "Carrier 3-ton"
  attrs      Json?    // { year, make, model, vin, plate } | { sqft, systemType, installedYear }
  createdAt  DateTime @default(now())

  bookings   Booking[]

  @@index([customerId])
}
```

### 1.4 `CustomerTag` — segmentation

```prisma
model CustomerTag {
  id         String   @id @default(cuid())
  customerId String
  customer   Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  label      String

  @@unique([customerId, label])
  @@index([label])
}
```

### 1.5 `CustomerEvent` — the non-call, non-booking timeline

Calls and bookings already live in their own tables and are unioned at read time (§3.4).
This table holds only what has no home today: notes, stage changes, tag changes, outbound
messages, follow-up completions.

```prisma
model CustomerEvent {
  id         String   @id @default(cuid())
  shopId     String
  customerId String
  customer   Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  kind       String   // note | stage_change | tag | sms_sent | email_sent | followup_done | merged
  body       String?
  detail     Json?
  actorId    String?  // user id, or null for system
  createdAt  DateTime @default(now())

  @@index([customerId, createdAt])
}
```

### 1.6 Follow-up engine

```prisma
model FollowUpRule {
  id         String   @id @default(cuid())
  shopId     String
  shop       Shop     @relation(fields: [shopId], references: [id])
  trigger    String   // call_unbooked | booking_completed | no_show | dormant
  delayHours Int
  channel    String   // sms | email | task
  template   String   // supports {{firstName}}, {{service}}, {{shopName}}
  enabled    Boolean  @default(false)   // OFF by default — see §5
  createdAt  DateTime @default(now())

  @@index([shopId, trigger])
}

model FollowUpTask {
  id         String    @id @default(cuid())
  shopId     String
  customerId String
  customer   Customer  @relation(fields: [customerId], references: [id], onDelete: Cascade)
  ruleId     String?
  callId     String?
  dueAt      DateTime
  channel    String    // sms | email | task
  body       String
  status     String    @default("pending") // pending | sent | done | skipped | failed
  sentAt     DateTime?
  createdAt  DateTime  @default(now())

  @@index([shopId, status, dueAt])
  @@index([customerId])
}
```

### 1.7 Changes to existing models

```prisma
// CallRecord
customerId String?
customer   Customer? @relation(fields: [customerId], references: [id])
@@index([customerId, timestamp])

// Booking
customerId String?
customer   Customer? @relation(fields: [customerId], references: [id])
assetId    String?
asset      CustomerAsset? @relation(fields: [assetId], references: [id])
valueCents Int?      // ACTUAL value once completed, vs CallRecord.estJobValue (estimated)
// status widens: confirmed | completed | canceled | no_show

// Shop
customers    Customer[]
followUpRules FollowUpRule[]
```

All new columns on existing tables are nullable → the migration is additive and cannot
break the live call path.

---

## 2. Migration & backfill

Follows the established convention: `prisma db push` for dev, hand-written SQL in
`prisma/prod-migrations/` for Turso prod (per `2026-07-12-add-booking.sql`).

- `prisma/prod-migrations/2026-08-10-customer-layer.sql` — CREATE TABLE ×7, ALTER TABLE ×4,
  all indexes. Additive only, no data movement.

  **Hand-written, not `prisma migrate diff` output — and this matters.** SQLite can't
  add a FOREIGN KEY to an existing table in place, so Prisma's generated diff uses its
  "RedefineTables" strategy for `CallRecord` and `Booking`: create a new table, copy
  every row, `DROP TABLE`, rename. That is a full copy-and-drop of the live
  call-recording table on a database taking production traffic, with no wrapping
  transaction in the Turso shell — in exchange for DB-level enforcement of three
  nullable FKs. Bad trade. The migration adds those columns *without* the FK
  constraints.

  What that costs: database-level referential enforcement only. Prisma Client builds
  relations from `schema.prisma`, not from the DB's constraint table, so
  `include: { customer: true }` behaves identically. `onDelete: SetNull` is moot today
  because nothing hard-deletes a Customer — if that changes, the delete path has to
  null the columns itself.

  **Known, intentional drift:** `prisma db push` in dev *does* rebuild the tables, so
  dev has the FK constraints and prod doesn't. That's the only difference between them.
  Verified by applying the SQL to a replica of the pre-migration schema: it applies
  clean, existing rows survive, and the `(shopId, phoneE164)` unique index enforces.

- `scripts/backfill-customers.mjs` — idempotent, re-runnable. (`.mjs`, matching the
  other scripts in that directory; the repo has no TypeScript script runner.)
  1. Read every `CallRecord.callerPhone` and `Booking.customerPhone`, grouped by shop.
  2. Normalize through the existing `toE164` in [phone.ts](lib/phone.ts). **Rows that
     normalize to `null` (blocked/withheld caller ID, malformed) stay unlinked — they are
     anonymous calls, and forcing them into a customer would corrupt the data.** Expect a
     real percentage of these; the UI must show them as "Unknown caller," not hide them.
  3. Upsert `Customer` + `CustomerPhone` per distinct `(shopId, phoneE164)`.
  4. Backfill `customerId` on `CallRecord` / `Booking`.
  5. Recompute all rollups from scratch.
- The script prints a dry-run report (`--dry`) before writing, including the
  normalization hit rate and a sample of values that failed.

**Open risk — still open against prod.** Existing `callerPhone` values come straight from
the voice provider's `from_number` and have never been normalized on write. Against the
local dev database the hit rate is 100%, but **that database is seeded mock data and
proves nothing about production.** Run `--dry` against prod and read the report before
running for real. If the rate is poor, fix `toE164` in `lib/phone.ts` first and re-run —
the script picks up previously-unlinkable rows on a later pass.

Verified locally: 91 customers created from 91 calls; a second run created 0 and reused
91, with row counts unchanged.

---

## 3. Runtime behavior

### 3.1 Identity resolution on ingest

`lib/customer.ts` — new module, single entry point:

```ts
resolveCustomer(shopId, rawPhone, hints?: { name?, service? }): Promise<Customer | null>
```

- Normalize → `null` phone returns `null` (anonymous call, no customer row).
- `upsert` on `CustomerPhone` `@@unique([shopId, phoneE164])` — concurrency-safe by
  construction, no read-then-write race.
- On create: seed `displayName` from the agent's captured name when available.
- On hit: update `lastContactAt`, bump `callCount`, promote `stage` `lead → active` on
  first completed booking.

Called from `recordCall` in [ingest.ts](lib/ingest.ts) — the one chokepoint both the legacy
`/api/ingest/call` and native `/api/agent/call-events` paths already share. **Wrapped so it
can never throw into the call path**; a CRM failure must not lose a call record. This
mirrors the existing best-effort pattern used for the notify backstop.

Also called from `createConfirmedBooking` in [booking.ts](lib/booking.ts) so
agent-created bookings link even when the call webhook lands later.

### 3.2 Ordering problem (must be handled)

`create_booking` fires *mid-call*; `call-events` lands *after* the call. Either can create
the customer first. The upsert-on-unique-index design makes both orders converge on the
same row. Explicit test coverage for both orderings.

### 3.3 Rollups

Recomputed inside the same transaction as the triggering write, not on read. `lifetimeValue`
sums `Booking.valueCents` where status = completed, falling back to `CallRecord.estJobValue`
on booked calls where no actual value was ever entered — so the number is never zero for a
shop that hasn't adopted job-costing.

A nightly reconciliation job (`/api/jobs/customer-rollups`, same QStash cron pattern as the
7 existing jobs) repairs drift.

### 3.4 Timeline read

Union at read time rather than a materialized feed — no write amplification, no sync bugs,
and volumes are small. `getCustomerTimeline(customerId)` merges `CallRecord`, `Booking`,
`FollowUpTask`, and `CustomerEvent` into one sorted, discriminated-union array. Revisit only
if a shop crosses ~10k events.

---

## 4. Surfaces

### Phase A — invisible (schema, backfill, resolution)
No UI. Ships dark. Every subsequent phase is additive on top of a populated database, which
means Phase B opens with real history instead of an empty state.

### Phase B — web CRM
- `/app/customers` — searchable list (name/phone), filter by stage + tag, sort by last
  contact / LTV / call count. Server Component + server actions, matching the existing
  `app/app/settings` pattern (`page.tsx` + `actions.ts` + a client editor component).
- `/app/customers/[id]` — header with rollups, unified timeline, assets, bookings, notes,
  tags, stage control.
- Caller name + "4th call this month" context injected into the existing dashboard call feed.
- **Multi-shop note:** every owner page currently resolves the shop via `findFirst`
  (BACKLOG: "Multi-shop owner UI"). New pages must go through the same resolver so they
  inherit the fix rather than duplicating the bug.

### Phase C — agent recognition (the differentiator)
New agent tool `lookup_customer` in `app/api/agent/lookup-customer/route.ts`, HMAC-authed
via the existing `lib/integrations/agentTools.ts` pattern. Given the caller's number it
returns name, last service, last visit date, and open assets. Agent templates in
`lib/templates/` gain an optional returning-caller opening.

**Gate:** the agent must degrade silently on a miss or a slow response — a cold open is
fine, a 3-second dead-air pause is not. Hard timeout, cached, non-blocking.

**Privacy check:** the tool is shop-scoped by `client_id` and returns only that shop's own
customer data — the same isolation boundary already enforced everywhere else. Worth an
explicit test asserting shop A cannot resolve shop B's caller.

### Phase D — pipeline + follow-up engine
Rules UI, task queue, and a `/api/jobs/followups` cron that materializes due tasks and
sends them. The headline view: **"Called but didn't book"** — the list of warm leads the
shop cannot see today.

### Phase E — analytics + mobile
Repeat-customer rate, LTV distribution, unbooked-call recovery funnel, per-customer revenue
attribution. Mobile: customer screen, and caller-name enrichment on the push notification
(`pushToOwner` already carries `callerPhone` — it becomes "Dwayne Leon · Silverado").

---

## 5. Compliance — read before Phase D

**This is the one part of the plan that can create legal exposure rather than just bugs.**

Everything shipped so far texts *the shop owner*, who has explicitly consented
(`Shop.smsConsentAt`) and can reply STOP (`Shop.smsOptOut`). Phase D is categorically
different: it texts **the shop's customers**, who never signed up for anything.

Requirements before a single outbound customer SMS:

1. **A2P 10DLC campaign use-case may need to change.** The registered campaign covers
   owner notifications. Customer marketing/follow-up is a different use case and likely a
   different campaign. This has a carrier clock measured in weeks and is on the critical
   path — it is not a launch-day detail. (`GATE A` in [GO-LIVE.md](GO-LIVE.md) is still
   open on A2P generally.)
2. **Per-customer STOP handling.** The inbound webhook at
   `app/api/webhooks/twilio/sms/route.ts` currently maps STOP to the *shop*. It must
   also resolve the sender to a `Customer` and set `Customer.smsOptOut`.
3. **`canSendCustomerSms(customer, shop)`** — a new gate distinct from the existing
   `canSendSms`. Checks `doNotContact`, `smsOptOut`, shop A2P status, and quiet hours in
   the shop's timezone (TCPA: no texts 9pm–8am local).
4. **`FollowUpRule.enabled` defaults to `false`.** The owner opts in per rule and sees
   exactly what will be sent.
5. **Transactional vs. marketing.** "Your appointment is tomorrow at 9" is a different
   legal animal from "haven't seen you in 6 months, here's 10% off." Ship transactional
   first; treat marketing as a separate decision.

**Recommendation:** Phases A–C carry no new compliance surface and can proceed immediately.
Phase D should not start until A2P is sorted, and its email channel (already covered by
Resend + the existing unsubscribe route) is the safer first implementation.

---

## 6. Testing

Matching the existing vitest suite (43 files, `lib/*.test.ts` colocated):

**Shipped (Phase A): 35 new tests, 193 total green.**

- `lib/customer.test.ts` (17) — pure logic, matching the suite's existing style: the
  dollars→cents boundary, stage transitions, blocked-caller-ID normalization, and an
  assertion that the backfill script's duplicated `toE164` still agrees with
  `lib/phone.ts` (the script is `.mjs` and can't import the server-only TS chain, so the
  duplication is deliberate — this makes drift loud instead of silent).
- `lib/customer-db.test.ts` (18) — DB-backed, against a real SQLite database built from
  `prisma/schema.prisma` itself in a temp dir, so the tests can't drift from the model.
  Covers both write orderings, concurrent resolution, tenant isolation, and rollup math.

**On the concurrency test specifically.** The first version asserted "one customer exists
afterwards" and passed even when the upsert was replaced with `findUnique`-then-`create` —
because the unique index rejects the losing inserts anyway. It just rejects them by
*throwing*, and in production those callers go through `resolveCustomerSafe`, which
swallows the error: the call is still recorded but silently loses its customer link. The
test now asserts that **every** concurrent caller gets a customer back, which is the
property that actually distinguishes the two implementations. Confirmed by mutation:
swapping in read-then-write fails that test and only that test.

**Enabling change:** `server-only` is a build-time marker Next resolves and not a real
package, so any lib guarding itself with it was unimportable from a test. The repo worked
around this by keeping testable libs free of the guard (see the comments in
`lib/capacity.ts`, `lib/slo.ts`, `lib/public-demo.ts`) — which left the ~20 libs that most
need it, the ones touching the database and secrets, untestable. `vitest.config.ts` now
aliases it to `test/server-only-stub.ts`. The production guard is unchanged.

Still to write when the surfaces land:
- Shop-isolation coverage for the Phase C `lookup_customer` agent tool.
- `lib/followup.test.ts` — quiet hours across timezones + DST, consent gating.
- `lib/followup.test.ts` — quiet hours across timezones + DST, consent gating, template
  rendering.
- Typecheck + full suite + build green before each phase merges, per existing practice.

---

## 7. Sequence & what I need from you

| Phase | Scope | Blocked on |
|---|---|---|
| ✅ A | Schema, prod migration, backfill, resolution in ingest | **shipped 2026-08-10** |
| B | Web CRM list + detail + timeline | A |
| C | Agent returning-caller recognition | A |
| D | Pipeline + follow-up engine | A, **A2P campaign** |
| E | Analytics + mobile surfacing | A, B |

A → B → C is a clean, unblocked run. D is gated on the carrier, not on code.

**Decisions made before Phase A:**
1. **Cents everywhere new**, with the single conversion from `CallRecord.estJobValue`
   (whole dollars) isolated in `estJobValueToCents` in `lib/customer.ts` and covered by
   tests on both sides.
2. **Backfill runs against prod immediately** — after a `--dry` pass whose report is
   actually read.

## 8. Deploying Phase A

Phase A ships dark: nothing in the UI changes, and the only behavior difference on the
live call path is that each call and agent booking now also resolves a customer,
best-effort.

```bash
turso db shell switchboard < prisma/prod-migrations/2026-08-10-customer-layer.sql
```

Then, with prod `DATABASE_URL` + `TURSO_AUTH_TOKEN` in the environment:

```bash
node scripts/backfill-customers.mjs --dry
```

Read the normalization report. If the hit rate looks wrong, stop and fix `toE164` first.
Otherwise re-run without `--dry`. It's idempotent, so a partial failure is safe to retry.

Finally add the new cron (`scripts/setup-qstash.mjs` already includes it and skips
schedules that exist):

```bash
node scripts/setup-qstash.mjs
```

Optionally set `HEARTBEAT_URL_CUSTOMER_ROLLUPS` to a Checkly heartbeat, matching the
other six jobs.

---

## 9. Phase A — what actually happened (2026-08-13)

Migration and backfill are **applied and verified against prod**. App code is **not yet
deployed** — that ordering is deliberate (additive schema first, code second; old code
simply doesn't know the new columns exist).

**Results**

| | |
|---|---|
| Phone normalization | **100%** (97/97 calls, 1/1 booking) |
| Unlinkable / anonymous | **0** |
| Customers created | **93** |
| Cross-shop leaks | **0** |
| Rollup drift | **0** |
| Second run | created 0, reused 93 — idempotent |

The §2 "open risk" is **closed**: `callerPhone` was worried about because it had never been
normalized on write, but prod turned out to be uniformly `+1XXXXXXXXXX` E.164 — the voice
provider had been supplying clean values all along. No `toE164` fix was needed.

**What the verification surfaced — a real gap, not a Phase A defect**

Nothing in the codebase ever transitions a `Booking` to `completed` or `no_show`. Grep
finds only *readers* of those statuses (`lib/customer.ts`, the backfill). Consequences:

- `Booking.valueCents` is currently written by nobody, so `actualCents` is always 0 and
  `lifetimeValue` **always falls back to call estimates** — the fallback branch in §3.3 is
  not a fallback today, it is the only path.
- `noShowCount` is structurally always 0.

This is why prod's top repeat caller shows 5 calls, 1 booking, and `$0.00` LTV: both of its
booked calls carry `estJobValue = 0`, and its booking is `confirmed`, which counts toward
neither branch. The arithmetic is right; the lifecycle is missing.

**Phase B must therefore add** an owner-facing way to mark a job complete and enter its
actual value. Until it does, every LTV figure in the product is the AI's pre-job estimate,
and should be labelled as such in the UI rather than presented as revenue.

**Still open before this is live**

1. Deploy the app code (`/api/jobs/customer-rollups` currently 404s in prod).
2. **Then** `node scripts/setup-qstash.mjs` — registering the cron before the deploy would
   just 404 daily against a route that doesn't exist.
3. Optionally wire `HEARTBEAT_URL_CUSTOMER_ROLLUPS`.
