// Backfill the customer layer from existing call/booking history.
//
//   node scripts/backfill-customers.mjs --dry     # report only, writes nothing
//   node scripts/backfill-customers.mjs           # apply
//
//   DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node scripts/backfill-customers.mjs
//   (omit both to run against the local prisma/dev.db)
//
// Idempotent: every write is an upsert keyed on (shopId, phoneE164) or an id,
// so running it twice is a no-op. Safe to re-run after a partial failure and
// safe to re-run later to pick up rows that ingest failed to link.
//
// ---------------------------------------------------------------------------
// ALWAYS RUN --dry FIRST, especially against prod.
//
// CallRecord.callerPhone has never been normalized on write — it is whatever
// the voice provider put in `from_number`. Nobody knows the real shape of that
// data until it's measured. --dry reports the normalization hit rate and a
// sample of what failed, so we find out BEFORE writing thousands of customer
// rows built on a bad assumption.
//
// Numbers that toE164 can't confidently normalize (blocked/withheld caller ID,
// truncated numbers, SIP URIs) are deliberately LEFT UNLINKED rather than being
// forced onto a customer. An anonymous call is real data; collapsing every one
// of them into a single fictional "unknown" customer would corrupt every
// rollup on the page.
// ---------------------------------------------------------------------------

import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

// --- env (mirrors lib/db.ts URL resolution) ---------------------------------
function loadEnv() {
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      if (!line.includes("=") || line.trim().startsWith("#")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
loadEnv();

function resolveUrl(raw) {
  const url = raw ?? "file:./dev.db";
  if (!url.startsWith("file:")) return url;
  const rel = url.slice("file:".length);
  return path.isAbsolute(rel) ? `file:${rel}` : `file:${path.join(process.cwd(), "prisma", rel)}`;
}

const url = resolveUrl(process.env.DATABASE_URL);
const prisma = new PrismaClient({
  adapter: new PrismaLibSQL({ url, authToken: process.env.TURSO_AUTH_TOKEN }),
});

const DRY = process.argv.includes("--dry");

// --- phone normalization ----------------------------------------------------
// Deliberately a copy of lib/phone.ts toE164 rather than an import: this is a
// .mjs script and lib/phone.ts is TypeScript with a "server-only" chain. The
// logic is 8 lines and frozen; the test suite asserts the two stay in agreement
// (see lib/customer.test.ts → "backfill script normalization matches toE164").
export function toE164(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  const t = String(raw).trim();
  if (/^\+\d{8,15}$/.test(t)) return t;
  return null;
}

export function splitName(name) {
  if (!name) return { first: null, last: null };
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export function estJobValueToCents(dollars) {
  if (!dollars || !Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

const DORMANT_DAYS = 180;
function nextStage(bookingCount, lastContactAt, now) {
  const days = (now.getTime() - lastContactAt.getTime()) / 86_400_000;
  if (days > DORMANT_DAYS) return "dormant";
  if (bookingCount > 0) return "active";
  return "lead";
}

// ---------------------------------------------------------------------------

async function main() {
  const started = Date.now();
  console.log(`\n${DRY ? "DRY RUN — nothing will be written" : "APPLYING"}`);
  console.log(`db: ${url.startsWith("file:") ? url : "(remote turso)"}\n`);

  const shops = await prisma.shop.findMany({ select: { id: true, businessName: true } });
  console.log(`${shops.length} shop(s)\n`);

  const totals = {
    calls: 0, callsNormalized: 0, callsUnlinkable: 0,
    bookings: 0, bookingsNormalized: 0, bookingsUnlinkable: 0,
    customersCreated: 0, customersExisting: 0,
    callsLinked: 0, bookingsLinked: 0,
  };
  const unlinkableSamples = new Set();

  for (const shop of shops) {
    const [calls, bookings] = await Promise.all([
      prisma.callRecord.findMany({
        where: { shopId: shop.id },
        select: { id: true, callerPhone: true, timestamp: true, booked: true, estJobValue: true, customerId: true },
        orderBy: { timestamp: "asc" },
      }),
      prisma.booking.findMany({
        where: { shopId: shop.id },
        select: { id: true, customerPhone: true, customerName: true, status: true, valueCents: true, createdAt: true, customerId: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    totals.calls += calls.length;
    totals.bookings += bookings.length;

    // Group every historical contact by normalized number. Bookings carry a
    // customerName that calls don't, so they're the better source for a name.
    /** @type {Map<string, {name: string|null, first: Date, last: Date, callIds: string[], bookingIds: string[], booked: number, noShow: number, estCents: number, actualCents: number}>} */
    const byPhone = new Map();

    const touch = (phoneE164, at) => {
      let e = byPhone.get(phoneE164);
      if (!e) {
        e = { name: null, first: at, last: at, callIds: [], bookingIds: [], booked: 0, noShow: 0, estCents: 0, actualCents: 0 };
        byPhone.set(phoneE164, e);
      }
      if (at < e.first) e.first = at;
      if (at > e.last) e.last = at;
      return e;
    };

    for (const c of calls) {
      const p = toE164(c.callerPhone);
      if (!p) {
        totals.callsUnlinkable++;
        if (c.callerPhone && unlinkableSamples.size < 12) unlinkableSamples.add(String(c.callerPhone));
        continue;
      }
      totals.callsNormalized++;
      const e = touch(p, c.timestamp);
      e.callIds.push(c.id);
      if (c.booked) e.estCents += estJobValueToCents(c.estJobValue);
    }

    for (const b of bookings) {
      const p = toE164(b.customerPhone);
      if (!p) {
        totals.bookingsUnlinkable++;
        if (b.customerPhone && unlinkableSamples.size < 12) unlinkableSamples.add(String(b.customerPhone));
        continue;
      }
      totals.bookingsNormalized++;
      const e = touch(p, b.createdAt);
      e.bookingIds.push(b.id);
      if (!e.name && b.customerName) e.name = b.customerName.trim() || null;
      if (b.status === "confirmed" || b.status === "completed") e.booked++;
      if (b.status === "no_show") e.noShow++;
      if (b.status === "completed" && b.valueCents != null) e.actualCents += b.valueCents;
    }

    if (byPhone.size === 0) continue;
    console.log(`  ${shop.businessName}: ${byPhone.size} distinct customer(s) from ${calls.length} call(s) + ${bookings.length} booking(s)`);

    if (DRY) {
      totals.customersCreated += byPhone.size;
      continue;
    }

    const now = new Date();
    for (const [phoneE164, e] of byPhone) {
      // Upsert on the same unique index ingest uses, so this converges with
      // anything the live path has already created rather than fighting it.
      const existing = await prisma.customerPhone.findUnique({
        where: { shopId_phoneE164: { shopId: shop.id, phoneE164 } },
        select: { customerId: true },
      });

      let customerId;
      if (existing) {
        customerId = existing.customerId;
        totals.customersExisting++;
      } else {
        const { first, last } = splitName(e.name);
        const created = await prisma.customer.create({
          data: {
            shopId: shop.id,
            displayName: e.name,
            firstName: first,
            lastName: last,
            source: "import",
            firstSeenAt: e.first,
            lastContactAt: e.last,
            phones: { create: { shopId: shop.id, phoneE164, isPrimary: true } },
          },
          select: { id: true },
        });
        customerId = created.id;
        totals.customersCreated++;
      }

      // Link the source rows. updateMany with an id filter is a no-op on a
      // second run because we only target rows that aren't linked yet.
      if (e.callIds.length) {
        const r = await prisma.callRecord.updateMany({
          where: { id: { in: e.callIds }, customerId: null },
          data: { customerId },
        });
        totals.callsLinked += r.count;
      }
      if (e.bookingIds.length) {
        const r = await prisma.booking.updateMany({
          where: { id: { in: e.bookingIds }, customerId: null },
          data: { customerId },
        });
        totals.bookingsLinked += r.count;
      }

      // Rollups. Actuals and estimates describe the same jobs, so they're never
      // summed — actuals win once a shop enters any real number.
      const lifetimeValue = e.actualCents > 0 ? e.actualCents : e.estCents;
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          callCount: e.callIds.length,
          bookingCount: e.booked,
          noShowCount: e.noShow,
          lifetimeValue,
          firstSeenAt: e.first,
          lastContactAt: e.last,
          stage: nextStage(e.booked, e.last, now),
        },
      });
    }
  }

  // --- report ---------------------------------------------------------------
  const pct = (n, d) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`);
  console.log(`\n${"─".repeat(58)}`);
  console.log(`calls              ${totals.calls}`);
  console.log(`  normalized       ${totals.callsNormalized}  (${pct(totals.callsNormalized, totals.calls)})`);
  console.log(`  UNLINKABLE       ${totals.callsUnlinkable}  (${pct(totals.callsUnlinkable, totals.calls)})  ← stay anonymous, by design`);
  console.log(`bookings           ${totals.bookings}`);
  console.log(`  normalized       ${totals.bookingsNormalized}  (${pct(totals.bookingsNormalized, totals.bookings)})`);
  console.log(`  UNLINKABLE       ${totals.bookingsUnlinkable}  (${pct(totals.bookingsUnlinkable, totals.bookings)})`);
  console.log(`customers ${DRY ? "would create" : "created"}  ${totals.customersCreated}`);
  if (!DRY) {
    console.log(`customers reused   ${totals.customersExisting}`);
    console.log(`calls linked       ${totals.callsLinked}`);
    console.log(`bookings linked    ${totals.bookingsLinked}`);
  }
  if (unlinkableSamples.size) {
    console.log(`\nsample unnormalizable values (first ${unlinkableSamples.size}):`);
    for (const s of unlinkableSamples) console.log(`  ${JSON.stringify(s)}`);
    console.log(`\nIf these look like numbers that SHOULD have parsed, fix toE164 in`);
    console.log(`lib/phone.ts first — re-running this script afterwards will pick them up.`);
  }
  console.log(`${"─".repeat(58)}`);
  console.log(`${DRY ? "dry run" : "done"} in ${Date.now() - started}ms`);
  if (DRY) console.log(`\nRe-run without --dry to apply.\n`);
  else console.log(``);
}

// Only run when executed directly, so the helpers above can be imported by
// lib/customer.test.ts — which asserts this file's copy of toE164 still agrees
// with lib/phone.ts. Importing this module must not open a DB connection or
// start writing customers.
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
