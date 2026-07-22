// Double-booking stress test.
//
// Two callers can ask for the same 9am at the same moment. If both get it, a
// shop owner finds out when two customers turn up together — the worst trust
// failure a booking product has.
//
// createConfirmedBooking re-checks availability and writes inside a
// prisma.$transaction, but Booking has only @@index([shopId, startUtc]), NOT
// @@unique — so nothing in the database itself forbids a duplicate. Whether the
// transaction actually serialises is a property of the driver and must be
// measured, not assumed.
//
// Fires N concurrent requests at the REAL endpoint (not a reimplementation of
// the logic) and counts what landed.
//
//   node scripts/stress-booking-race.mjs [concurrency] [baseUrl]
//
// Local dev.db only. Never point this at production — it writes real bookings.

import crypto from "node:crypto";
import { stressPrisma } from "./_stress-db.mjs";

const CONCURRENCY = Number(process.argv[2] ?? 10);
const BASE = process.argv[3] ?? "http://localhost:3100";
const SHOP_ID = "demo_reviewer_shop";

if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  throw new Error(`refusing to run against ${BASE} — this writes real bookings`);
}


const secret = process.env.AUTH_SECRET || "dev-insecure-secret";
const token = crypto.createHmac("sha256", secret).update(`agent:${SHOP_ID}`).digest("hex").slice(0, 32);

const { prisma, target } = stressPrisma();

// Next weekday at 10:00 shop-local — inside the seeded 08:00–17:00 hours, and
// far enough ahead that "in the past" can't be the reason a booking is refused.
function nextWeekdayAt10() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} 10:00`;
}

const slot = nextWeekdayAt10();
console.log(`\n  database:    ${target}`);
console.log(`  slot:        ${slot} (shop local)`);
console.log(`  concurrency: ${CONCURRENCY}`);

// Clean slate so a previous run can't be mistaken for a race.
const cleared = await prisma.booking.deleteMany({ where: { shopId: SHOP_ID } });
console.log(`  cleared ${cleared.count} existing booking(s)\n`);

const url = `${BASE}/api/agent/create-booking?client_id=${SHOP_ID}&token=${token}`;

// Build every request first, then release them together — staggering the sends
// would let the first transaction commit before the rest even read, which is
// precisely the interleaving the test needs to create.
const results = await Promise.all(
  Array.from({ length: CONCURRENCY }, (_, i) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args: { preferred_time: slot, customer_name: `Caller ${i + 1}` } }),
    })
      .then((r) => r.json())
      .catch((e) => ({ booked: false, error: e.message })),
  ),
);

const claimedOk = results.filter((r) => r.booked === true).length;
const refused = results.filter((r) => r.booked === false).length;
const errored = results.filter((r) => r.error).length;

const rows = await prisma.booking.findMany({
  where: { shopId: SHOP_ID, status: "confirmed" },
  select: { id: true, startUtc: true, customerName: true },
  orderBy: { startUtc: "asc" },
});
const bySlot = new Map();
for (const r of rows) {
  const k = r.startUtc.toISOString();
  bySlot.set(k, (bySlot.get(k) ?? 0) + 1);
}

console.log(`  responses:   ${claimedOk} booked, ${refused} refused, ${errored} errored`);
console.log(`  rows in db:  ${rows.length}`);
for (const [k, n] of bySlot) console.log(`     ${k} → ${n} booking(s)`);

const worst = Math.max(0, ...bySlot.values());
console.log("");
if (worst > 1) {
  console.log(`  ❌ DOUBLE-BOOKED — ${worst} confirmed bookings share one slot.`);
  console.log(`     The transaction did not serialise. A @@unique([shopId, startUtc])`);
  console.log(`     constraint would make the database refuse the duplicate.`);
} else if (rows.length === 1 && claimedOk === 1) {
  console.log(`  ✅ exactly one booking survived ${CONCURRENCY} concurrent attempts.`);
} else if (rows.length === 0) {
  console.log(`  ⚠️  nothing booked at all — the slot was refused for another`);
  console.log(`     reason (closed hours, past, or config). Not a race result.`);
  console.log(`     First response: ${JSON.stringify(results[0])}`);
} else {
  console.log(`  ⚠️  unexpected: ${rows.length} rows, ${claimedOk} reported booked.`);
}

await prisma.$disconnect();
