import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { setupTestDb } from "../test/db-harness";

// DB-backed tests for the CRM read layer + booking lifecycle (Phase B).
//
// A real SQLite database built from the live schema, because the properties
// worth asserting here are tenant scoping and rollup arithmetic — neither of
// which a mock can prove.
//
// Every app import is dynamic, inside beforeAll. See test/db-harness.ts for why
// a static one would be dangerous rather than merely untidy.

let listCustomers: typeof import("./customers").listCustomers;
let getCustomerDetail: typeof import("./customers").getCustomerDetail;
let getCustomerTimeline: typeof import("./customers").getCustomerTimeline;
let lifetimeValueBasis: typeof import("./customers").lifetimeValueBasis;
let customerStageCounts: typeof import("./customers").customerStageCounts;
let setBookingOutcome: typeof import("./booking").setBookingOutcome;
let resolveCustomer: typeof import("./customer").resolveCustomer;
let prisma: typeof import("./db").prisma;

const SHOP_A = "shop_a";
const SHOP_B = "shop_b";

beforeAll(async () => {
  ({ prisma } = await setupTestDb("crm-read"));

  const customers = await import("./customers");
  listCustomers = customers.listCustomers;
  getCustomerDetail = customers.getCustomerDetail;
  getCustomerTimeline = customers.getCustomerTimeline;
  lifetimeValueBasis = customers.lifetimeValueBasis;
  customerStageCounts = customers.customerStageCounts;
  setBookingOutcome = (await import("./booking")).setBookingOutcome;
  resolveCustomer = (await import("./customer")).resolveCustomer;
  await prisma.user.create({ data: { id: "u1", email: "owner@example.com", emailVerified: true } });
  for (const id of [SHOP_A, SHOP_B]) {
    await prisma.shop.create({ data: { id, ownerId: "u1", businessName: `Shop ${id}`, vertical: "auto", status: "live" } });
  }
}, 60_000);

beforeEach(async () => {
  await prisma.customerEvent.deleteMany({});
  await prisma.customerTag.deleteMany({});
  await prisma.customerAsset.deleteMany({});
  await prisma.callRecord.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.customerPhone.deleteMany({});
  await prisma.customer.deleteMany({});
});

describe("listCustomers — search", () => {
  it("finds a customer by name", async () => {
    await resolveCustomer(SHOP_A, "7605550101", { name: "Dwayne Leon" });
    await resolveCustomer(SHOP_A, "7605550102", { name: "Ana Cruz" });
    const { rows } = await listCustomers(SHOP_A, { search: "dwayne" });
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe("Dwayne Leon");
  });

  it("finds a customer by phone typed the way a human types it", async () => {
    // Stored as +17605550101; the owner types it with punctuation. Searching
    // must strip to digits or this never matches — the single most likely
    // real-world lookup on this page.
    await resolveCustomer(SHOP_A, "7605550101", { name: "Dwayne Leon" });
    for (const typed of ["7605550101", "760-555-0101", "(760) 555-0101"]) {
      const { rows } = await listCustomers(SHOP_A, { search: typed });
      expect(rows.map((r) => r.displayName), `searching ${typed}`).toEqual(["Dwayne Leon"]);
    }
  });

  it("matches a partial phone fragment", async () => {
    await resolveCustomer(SHOP_A, "7605550101", { name: "Dwayne Leon" });
    const { rows } = await listCustomers(SHOP_A, { search: "0101" });
    expect(rows).toHaveLength(1);
  });

  it("ignores a fragment too short to mean anything", async () => {
    // "1" would otherwise match every +1 number in the book.
    await resolveCustomer(SHOP_A, "7605550101", { name: "Zed" });
    const { rows } = await listCustomers(SHOP_A, { search: "1" });
    expect(rows).toHaveLength(0);
  });

  it("never returns another shop's customers", async () => {
    await resolveCustomer(SHOP_A, "7605550101", { name: "Shop A Person" });
    await resolveCustomer(SHOP_B, "7605550101", { name: "Shop B Person" });
    const { rows } = await listCustomers(SHOP_A, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe("Shop A Person");
  });
});

describe("listCustomers — filter, sort, page", () => {
  beforeEach(async () => {
    const a = await resolveCustomer(SHOP_A, "7605550101", { name: "Alpha" });
    const b = await resolveCustomer(SHOP_A, "7605550102", { name: "Bravo" });
    await prisma.customer.update({ where: { id: a!.id }, data: { stage: "active", lifetimeValue: 50_000, callCount: 2 } });
    await prisma.customer.update({ where: { id: b!.id }, data: { stage: "lead", lifetimeValue: 90_000, callCount: 1 } });
  });

  it("filters by stage", async () => {
    const { rows } = await listCustomers(SHOP_A, { stage: "active" });
    expect(rows.map((r) => r.displayName)).toEqual(["Alpha"]);
  });

  it("sorts by value", async () => {
    const { rows } = await listCustomers(SHOP_A, { sort: "value" });
    expect(rows.map((r) => r.displayName)).toEqual(["Bravo", "Alpha"]);
  });

  it("sorts by call count", async () => {
    const { rows } = await listCustomers(SHOP_A, { sort: "calls" });
    expect(rows.map((r) => r.displayName)).toEqual(["Alpha", "Bravo"]);
  });

  it("reports the unpaginated total alongside the page", async () => {
    const { rows, total } = await listCustomers(SHOP_A, { take: 1 });
    expect(rows).toHaveLength(1);
    expect(total).toBe(2);
  });

  it("counts stages per shop only", async () => {
    await resolveCustomer(SHOP_B, "7605559999", { name: "Other" });
    const counts = await customerStageCounts(SHOP_A);
    expect(counts.all).toBe(2);
    expect(counts.active).toBe(1);
  });
});

describe("tenant isolation on detail reads", () => {
  it("getCustomerDetail returns null for another shop's customer", async () => {
    const b = await resolveCustomer(SHOP_B, "7605550101", { name: "Shop B Person" });
    expect(await getCustomerDetail(SHOP_B, b!.id)).not.toBeNull();
    // Same id, wrong shop — the id alone must never be enough.
    expect(await getCustomerDetail(SHOP_A, b!.id)).toBeNull();
  });

  it("getCustomerTimeline returns empty for another shop's customer", async () => {
    const b = await resolveCustomer(SHOP_B, "7605550101", {});
    await prisma.callRecord.create({
      data: { shopId: SHOP_B, customerId: b!.id, callId: "c1", timestamp: new Date(), summary: "secret" },
    });
    expect(await getCustomerTimeline(SHOP_B, b!.id)).toHaveLength(1);
    expect(await getCustomerTimeline(SHOP_A, b!.id)).toEqual([]);
  });
});

describe("getCustomerTimeline", () => {
  it("merges calls, bookings and events newest-first", async () => {
    const c = await resolveCustomer(SHOP_A, "7605550101", {});
    await prisma.callRecord.create({
      data: { shopId: SHOP_A, customerId: c!.id, callId: "c1", timestamp: new Date("2026-01-01T10:00:00Z") },
    });
    await prisma.booking.create({
      data: {
        shopId: SHOP_A,
        customerId: c!.id,
        startUtc: new Date("2026-03-01T10:00:00Z"),
        endUtc: new Date("2026-03-01T11:00:00Z"),
        status: "confirmed",
      },
    });
    await prisma.customerEvent.create({
      data: { shopId: SHOP_A, customerId: c!.id, kind: "note", body: "hi", createdAt: new Date("2026-02-01T10:00:00Z") },
    });

    const items = await getCustomerTimeline(SHOP_A, c!.id);
    expect(items.map((i) => i.kind)).toEqual(["booking", "event", "call"]);
  });
});

describe("setBookingOutcome", () => {
  async function seed() {
    const c = await resolveCustomer(SHOP_A, "7605550101", {});
    const b = await prisma.booking.create({
      data: {
        shopId: SHOP_A,
        customerId: c!.id,
        startUtc: new Date("2026-03-01T10:00:00Z"),
        endUtc: new Date("2026-03-01T11:00:00Z"),
        status: "confirmed",
      },
    });
    return { customerId: c!.id, bookingId: b.id };
  }

  it("completing with a value makes lifetime value REAL money", async () => {
    // The whole point of Phase B. Before this existed, lifetimeValue could only
    // ever be the voice model's pre-job estimate.
    const { customerId, bookingId } = await seed();
    await setBookingOutcome({ shopId: SHOP_A, bookingId, status: "completed", valueCents: 48_750 });

    const after = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(after!.lifetimeValue).toBe(48_750);
    expect(await lifetimeValueBasis(customerId)).toBe("actual");
  });

  it("an actual value overrides the estimate rather than stacking on it", async () => {
    const { customerId, bookingId } = await seed();
    // A booked call carrying a $400 estimate for the SAME job.
    await prisma.callRecord.create({
      data: { shopId: SHOP_A, customerId, callId: "c1", timestamp: new Date(), booked: true, estJobValue: 400 },
    });
    await setBookingOutcome({ shopId: SHOP_A, bookingId, status: "completed", valueCents: 48_750 });

    const after = await prisma.customer.findUnique({ where: { id: customerId } });
    // 48_750, NOT 48_750 + 40_000 — double-counting one job would inflate every
    // revenue figure in the product.
    expect(after!.lifetimeValue).toBe(48_750);
  });

  it("falls back to the estimate, and labels it as one, until a job is closed", async () => {
    const { customerId } = await seed();
    await prisma.callRecord.create({
      data: { shopId: SHOP_A, customerId, callId: "c1", timestamp: new Date(), booked: true, estJobValue: 400 },
    });
    const { refreshRollups } = await import("./customer");
    await refreshRollups(customerId);

    const after = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(after!.lifetimeValue).toBe(40_000); // dollars → cents
    expect(await lifetimeValueBasis(customerId)).toBe("estimated");
  });

  it("counts a no-show without adding value", async () => {
    const { customerId, bookingId } = await seed();
    await setBookingOutcome({ shopId: SHOP_A, bookingId, status: "no_show" });
    const after = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(after!.noShowCount).toBe(1);
    expect(after!.bookingCount).toBe(0);
    expect(after!.lifetimeValue).toBe(0);
  });

  it("clears the value when a completed job is walked back", async () => {
    // A mis-click must not leave revenue attached to work that didn't happen.
    const { customerId, bookingId } = await seed();
    await setBookingOutcome({ shopId: SHOP_A, bookingId, status: "completed", valueCents: 48_750 });
    await setBookingOutcome({ shopId: SHOP_A, bookingId, status: "canceled" });

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(booking!.valueCents).toBeNull();
    const after = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(after!.lifetimeValue).toBe(0);
  });

  it("refuses to close out another shop's booking", async () => {
    const { bookingId } = await seed();
    const res = await setBookingOutcome({ shopId: SHOP_B, bookingId, status: "completed", valueCents: 999_99 });
    expect(res.ok).toBe(false);
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(booking!.status).toBe("confirmed"); // untouched
  });

  it("ignores a negative value rather than subtracting from lifetime revenue", async () => {
    const { customerId, bookingId } = await seed();
    await setBookingOutcome({ shopId: SHOP_A, bookingId, status: "completed", valueCents: -5_000 });
    const after = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(after!.lifetimeValue).toBe(0);
  });

  it("promotes the customer to active on a completed job", async () => {
    const { customerId, bookingId } = await seed();
    await setBookingOutcome({ shopId: SHOP_A, bookingId, status: "completed", valueCents: 10_000 });
    const after = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(after!.stage).toBe("active");
  });
});
