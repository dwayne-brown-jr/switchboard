import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// DB-backed tests for the customer layer.
//
// The rest of the suite is pure-logic, but the guarantees that matter most here
// are properties of the DATABASE, not of a function: that a unique index makes
// concurrent ingest converge, and that tenant scoping actually holds. Asserting
// those against a mock would only prove the mock agrees with itself.
//
// So this file builds a real SQLite database from the live schema in a temp
// dir, points DATABASE_URL at it, and imports lib/customer.ts afterwards (the
// prisma client in lib/db.ts reads the URL at module load, so the import has to
// come second — hence the dynamic imports in beforeAll).

let resolveCustomer: typeof import("./customer").resolveCustomer;
let refreshRollups: typeof import("./customer").refreshRollups;
let reconcileRollups: typeof import("./customer").reconcileRollups;
let computeRollups: typeof import("./customer").computeRollups;
let prisma: typeof import("./db").prisma;

const SHOP_A = "shop_a";
const SHOP_B = "shop_b";

beforeAll(async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "switchboard-crm-"));
  const dbFile = path.join(dir, "test.db");

  // Build the schema from prisma/schema.prisma itself rather than a checked-in
  // snapshot, so these tests can never silently drift from the real model.
  const ddl = execFileSync(
    "npx",
    ["prisma", "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
    { encoding: "utf8", cwd: process.cwd() },
  );

  const { createClient } = await import("@libsql/client");
  const client = createClient({ url: `file:${dbFile}` });
  await client.executeMultiple(ddl);
  client.close();

  process.env.DATABASE_URL = `file:${dbFile}`;

  const customer = await import("./customer");
  resolveCustomer = customer.resolveCustomer;
  refreshRollups = customer.refreshRollups;
  reconcileRollups = customer.reconcileRollups;
  computeRollups = customer.computeRollups;
  prisma = (await import("./db")).prisma;

  await prisma.user.create({
    data: { id: "u1", email: "owner@example.com", emailVerified: true },
  });
  for (const id of [SHOP_A, SHOP_B]) {
    await prisma.shop.create({
      data: { id, ownerId: "u1", businessName: `Shop ${id}`, vertical: "auto", status: "live" },
    });
  }
}, 60_000);

beforeEach(async () => {
  // Order matters: children before parents.
  await prisma.callRecord.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.customerPhone.deleteMany({});
  await prisma.customer.deleteMany({});
});

describe("resolveCustomer — identity", () => {
  it("creates a customer on first contact", async () => {
    const c = await resolveCustomer(SHOP_A, "555-123-4567", { name: "Dwayne Leon" });
    expect(c).not.toBeNull();
    expect(c!.displayName).toBe("Dwayne Leon");
    expect(c!.firstName).toBe("Dwayne");
    expect(c!.lastName).toBe("Leon");
    expect(c!.stage).toBe("lead");
  });

  it("returns the SAME customer for the same number in any format", async () => {
    const first = await resolveCustomer(SHOP_A, "5551234567");
    const second = await resolveCustomer(SHOP_A, "(555) 123-4567");
    const third = await resolveCustomer(SHOP_A, "+15551234567");
    expect(second!.id).toBe(first!.id);
    expect(third!.id).toBe(first!.id);
    expect(await prisma.customer.count({ where: { shopId: SHOP_A } })).toBe(1);
  });

  it("returns null and creates nothing for a number it can't normalize", async () => {
    // Blocked/withheld caller ID. These stay anonymous by design — see
    // customer.test.ts for why collapsing them into one customer is worse.
    for (const raw of [null, undefined, "", "anonymous", "unknown", "+1555"]) {
      expect(await resolveCustomer(SHOP_A, raw)).toBeNull();
    }
    expect(await prisma.customer.count()).toBe(0);
  });

  it("fills in a name it didn't have, but never overwrites one it did", async () => {
    await resolveCustomer(SHOP_A, "5551234567"); // no name — anonymous booking
    const named = await resolveCustomer(SHOP_A, "5551234567", { name: "Dwayne Leon" });
    expect(named!.displayName).toBe("Dwayne Leon");

    // An owner may have corrected the name by hand; a later call's
    // transcription of a name over a phone line is the weaker source.
    const later = await resolveCustomer(SHOP_A, "5551234567", { name: "Dwane Leone" });
    expect(later!.displayName).toBe("Dwayne Leon");
  });

  it("widens firstSeenAt/lastContactAt as out-of-order contacts arrive", async () => {
    const mid = new Date("2026-06-15T12:00:00Z");
    const early = new Date("2026-01-01T12:00:00Z");
    const late = new Date("2026-08-01T12:00:00Z");

    await resolveCustomer(SHOP_A, "5551234567", { at: mid });
    await resolveCustomer(SHOP_A, "5551234567", { at: late });
    const c = await resolveCustomer(SHOP_A, "5551234567", { at: early });

    expect(c!.firstSeenAt.toISOString()).toBe(early.toISOString());
    expect(c!.lastContactAt.toISOString()).toBe(late.toISOString());
  });
});

describe("resolveCustomer — tenant isolation", () => {
  it("gives two shops separate customers for the same caller", async () => {
    const a = await resolveCustomer(SHOP_A, "5551234567", { name: "Dwayne" });
    const b = await resolveCustomer(SHOP_B, "5551234567", { name: "Dwayne" });

    expect(a!.id).not.toBe(b!.id);
    expect(a!.shopId).toBe(SHOP_A);
    expect(b!.shopId).toBe(SHOP_B);
    expect(await prisma.customer.count()).toBe(2);
  });

  it("never returns shop B's customer to shop A", async () => {
    // The IDOR guarantee the README claims, extended to the new tables. If the
    // unique index were on phoneE164 alone rather than (shopId, phoneE164),
    // this is the test that would catch it — and the failure mode would be one
    // shop reading another shop's customer list.
    await resolveCustomer(SHOP_B, "5559998888", { name: "Shop B Customer" });

    const leaked = await prisma.customer.findMany({ where: { shopId: SHOP_A } });
    expect(leaked).toHaveLength(0);

    const aResolved = await resolveCustomer(SHOP_A, "5559998888");
    expect(aResolved!.shopId).toBe(SHOP_A);
    expect(aResolved!.displayName).toBeNull(); // did NOT inherit B's name
  });
});

describe("resolveCustomer — write-order convergence", () => {
  // create_booking fires MID-call; the call-events webhook lands AFTER. Either
  // can be the first thing to see a given number. Both paths must land on one
  // customer, in both orders.
  it("converges when the booking is written first", async () => {
    const fromBooking = await resolveCustomer(SHOP_A, "5551112222", { name: "Booking First" });
    const fromCall = await resolveCustomer(SHOP_A, "+15551112222");
    expect(fromCall!.id).toBe(fromBooking!.id);
    expect(await prisma.customer.count({ where: { shopId: SHOP_A } })).toBe(1);
  });

  it("converges when the call is written first", async () => {
    const fromCall = await resolveCustomer(SHOP_A, "+15551112222");
    const fromBooking = await resolveCustomer(SHOP_A, "5551112222", { name: "Call First" });
    expect(fromBooking!.id).toBe(fromCall!.id);
    expect(fromBooking!.displayName).toBe("Call First"); // name still lands
    expect(await prisma.customer.count({ where: { shopId: SHOP_A } })).toBe(1);
  });

  it("resolves EVERY concurrent caller to one customer, with none failing", async () => {
    // The real race: a mid-call booking and the post-call webhook arriving
    // together. Nothing in application code serialises them.
    //
    // Note carefully what is and isn't asserted here. "One customer exists
    // afterwards" is too weak a bar — a naive findUnique-then-create also
    // satisfies it, because @@unique([shopId, phoneE164]) rejects the losing
    // inserts. It just rejects them by THROWING, and in production those
    // callers go through resolveCustomerSafe, which swallows the error and
    // returns null. The call still gets recorded, but silently loses its
    // customer link.
    //
    // So the property that actually distinguishes upsert from read-then-write
    // is that every concurrent caller gets a customer back. That's what this
    // asserts. (Verified by mutation: swapping the upsert for
    // findUnique-then-create fails this test and only this test.)
    const results = await Promise.all(
      Array.from({ length: 8 }, () => resolveCustomer(SHOP_A, "5553334444")),
    );

    expect(results.every((c) => c !== null)).toBe(true);
    expect(new Set(results.map((c) => c!.id)).size).toBe(1);
    expect(await prisma.customer.count({ where: { shopId: SHOP_A } })).toBe(1);
    expect(await prisma.customerPhone.count({ where: { shopId: SHOP_A } })).toBe(1);
  });
});

describe("re-ingest must not erase an existing link", () => {
  // recordCall's upsert re-runs on every webhook retry, and the voice provider
  // retries. The `update` branch therefore has to be conservative about
  // customerId: writing null on a miss would let one transient resolution
  // failure — or one retry whose payload arrives without a caller number —
  // erase a link a previous run or the backfill had already established.
  // Absence of a customer is not evidence there isn't one.
  //
  // This asserts the invariant at the database level, which is where it has to
  // hold; recordCall itself pulls in Twilio/Resend/push and isn't reachable
  // from a unit test.
  it("a null-customer update leaves a previously-linked call alone", async () => {
    const c = await resolveCustomer(SHOP_A, "5551234567");
    await prisma.callRecord.create({
      data: { shopId: SHOP_A, customerId: c!.id, callId: "retried", timestamp: new Date(), booked: true, estJobValue: 100 },
    });

    // Exactly what recordCall now does when resolution returns null: spread an
    // empty linkage object rather than `customerId: null`.
    const linkage: { customerId?: string } = {};
    await prisma.callRecord.update({
      where: { callId: "retried" },
      data: { durationSec: 240, ...linkage },
    });

    const after = await prisma.callRecord.findUnique({ where: { callId: "retried" } });
    expect(after!.customerId).toBe(c!.id); // link survived
    expect(after!.durationSec).toBe(240); // the rest of the update still applied
  });
});

describe("rollups", () => {
  async function seedCall(shopId: string, customerId: string, opts: { booked?: boolean; estJobValue?: number; at?: Date; callId?: string } = {}) {
    return prisma.callRecord.create({
      data: {
        shopId,
        customerId,
        callId: opts.callId ?? `call_${Math.random().toString(36).slice(2)}`,
        timestamp: opts.at ?? new Date(),
        booked: opts.booked ?? false,
        estJobValue: opts.estJobValue ?? 0,
      },
    });
  }

  it("counts calls and derives lifetime value from estimates", async () => {
    const c = await resolveCustomer(SHOP_A, "5551234567");
    await seedCall(SHOP_A, c!.id, { booked: true, estJobValue: 450 });
    await seedCall(SHOP_A, c!.id, { booked: true, estJobValue: 120 });
    await seedCall(SHOP_A, c!.id, { booked: false, estJobValue: 999 }); // unbooked → not revenue

    await refreshRollups(c!.id);
    const updated = await prisma.customer.findUnique({ where: { id: c!.id } });

    expect(updated!.callCount).toBe(3);
    expect(updated!.lifetimeValue).toBe(57_000); // (450 + 120) dollars → cents
  });

  it("lets actual job value override estimates rather than summing them", async () => {
    // Both describe the SAME job. Summing would double-count and quietly
    // inflate every shop's headline number.
    const c = await resolveCustomer(SHOP_A, "5551234567");
    await seedCall(SHOP_A, c!.id, { booked: true, estJobValue: 450 });
    await prisma.booking.create({
      data: {
        shopId: SHOP_A,
        customerId: c!.id,
        startUtc: new Date(),
        endUtc: new Date(Date.now() + 3_600_000),
        status: "completed",
        valueCents: 38_500, // the real invoice came in lower than the estimate
      },
    });

    await refreshRollups(c!.id);
    const updated = await prisma.customer.findUnique({ where: { id: c!.id } });
    expect(updated!.lifetimeValue).toBe(38_500);
  });

  it("counts bookings and no-shows separately", async () => {
    const c = await resolveCustomer(SHOP_A, "5551234567");
    const base = { shopId: SHOP_A, customerId: c!.id, startUtc: new Date(), endUtc: new Date(Date.now() + 3_600_000) };
    await prisma.booking.create({ data: { ...base, status: "confirmed" } });
    await prisma.booking.create({ data: { ...base, status: "completed" } });
    await prisma.booking.create({ data: { ...base, status: "no_show" } });
    await prisma.booking.create({ data: { ...base, status: "canceled" } });

    await refreshRollups(c!.id);
    const updated = await prisma.customer.findUnique({ where: { id: c!.id } });

    expect(updated!.bookingCount).toBe(2); // confirmed + completed
    expect(updated!.noShowCount).toBe(1);
    expect(updated!.stage).toBe("active"); // has bookings
  });

  it("only counts rows belonging to that customer", async () => {
    const a = await resolveCustomer(SHOP_A, "5551234567");
    const b = await resolveCustomer(SHOP_B, "5559998888");
    await seedCall(SHOP_A, a!.id, { booked: true, estJobValue: 100 });
    await seedCall(SHOP_B, b!.id, { booked: true, estJobValue: 900 });

    await refreshRollups(a!.id);
    const updated = await prisma.customer.findUnique({ where: { id: a!.id } });
    expect(updated!.callCount).toBe(1);
    expect(updated!.lifetimeValue).toBe(10_000);
  });

  it("returns null for a customer that doesn't exist", async () => {
    expect(await computeRollups("nope")).toBeNull();
  });
});

describe("reconcileRollups", () => {
  it("repairs drift written directly to the database", async () => {
    const c = await resolveCustomer(SHOP_A, "5551234567");
    await prisma.callRecord.create({
      data: { shopId: SHOP_A, customerId: c!.id, callId: "drifted", timestamp: new Date(), booked: true, estJobValue: 200 },
    });
    // Simulate the inline refresh having failed (it's best-effort by design).
    await prisma.customer.update({ where: { id: c!.id }, data: { callCount: 0, lifetimeValue: 0 } });

    const res = await reconcileRollups();
    expect(res.updated).toBeGreaterThan(0);

    const fixed = await prisma.customer.findUnique({ where: { id: c!.id } });
    expect(fixed!.callCount).toBe(1);
    expect(fixed!.lifetimeValue).toBe(20_000);
  });

  it("moves a long-quiet customer to dormant — the transition nothing else can make", async () => {
    // Dormancy happens by the passage of time. No write occurs on the day a
    // customer goes quiet, so without this sweep `stage` would stay "active"
    // forever. This is the job's whole reason to exist.
    const c = await resolveCustomer(SHOP_A, "5551234567", { at: new Date("2020-01-01T00:00:00Z") });
    await prisma.booking.create({
      data: {
        shopId: SHOP_A, customerId: c!.id, status: "completed",
        startUtc: new Date("2020-01-01T00:00:00Z"), endUtc: new Date("2020-01-01T01:00:00Z"),
        createdAt: new Date("2020-01-01T00:00:00Z"),
      },
    });
    await prisma.customer.update({ where: { id: c!.id }, data: { stage: "active" } });

    await reconcileRollups();
    const swept = await prisma.customer.findUnique({ where: { id: c!.id } });
    expect(swept!.stage).toBe("dormant");
  });

  it("is a no-op on an already-correct customer", async () => {
    const c = await resolveCustomer(SHOP_A, "5551234567");
    await prisma.callRecord.create({
      data: { shopId: SHOP_A, customerId: c!.id, callId: "settled", timestamp: new Date(), booked: true, estJobValue: 200 },
    });
    await refreshRollups(c!.id);

    const before = await prisma.customer.findUnique({ where: { id: c!.id } });
    const res = await reconcileRollups();
    const after = await prisma.customer.findUnique({ where: { id: c!.id } });

    expect(res.updated).toBe(0);
    // An untouched customer shouldn't get updatedAt bumped by a nightly sweep.
    expect(after!.updatedAt.toISOString()).toBe(before!.updatedAt.toISOString());
  });
});
