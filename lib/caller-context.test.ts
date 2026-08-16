import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { setupTestDb } from "../test/db-harness";

// Phase C: what the voice agent is allowed to learn about the caller.
//
// These tests are as much about what is NOT returned as what is. The payload is
// spoken aloud to whoever is holding the phone, and caller ID does not prove
// identity — so the disclosure boundary is a safety property, not a detail.
//
// NOTE: every app import below is dynamic, inside beforeAll. A static one here
// would bind lib/db.ts to the real dev database before the harness can redirect
// it — see test/db-harness.ts. `relativeMonths` is imported that way too, even
// though it's a pure function, because the module it lives in reaches lib/db.

let lookupCallerContext: typeof import("./caller-context").lookupCallerContext;
let relativeMonths: typeof import("./caller-context").relativeMonths;
let resolveCustomer: typeof import("./customer").resolveCustomer;
let prisma: typeof import("./db").prisma;

const SHOP_A = "shop_a";
const SHOP_B = "shop_b";
const PHONE = "7605550101";

beforeAll(async () => {
  ({ prisma } = await setupTestDb("caller"));

  const mod = await import("./caller-context");
  lookupCallerContext = mod.lookupCallerContext;
  relativeMonths = mod.relativeMonths;
  resolveCustomer = (await import("./customer")).resolveCustomer;

  await prisma.user.create({ data: { id: "u1", email: "o@example.com", emailVerified: true } });
  for (const id of [SHOP_A, SHOP_B]) {
    await prisma.shop.create({ data: { id, ownerId: "u1", businessName: id, vertical: "auto", status: "live" } });
  }
}, 60_000);

beforeEach(async () => {
  await prisma.customerAsset.deleteMany({});
  await prisma.callRecord.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.customerPhone.deleteMany({});
  await prisma.customer.deleteMany({});
});

describe("unknown callers", () => {
  it("is unknown when we've never heard from them", async () => {
    expect(await lookupCallerContext(SHOP_A, "7609999999")).toEqual({ known: false });
  });

  it("is unknown for a number that can't be normalized", async () => {
    for (const bad of [null, undefined, "", "anonymous", "blocked", "+1555"]) {
      expect(await lookupCallerContext(SHOP_A, bad)).toEqual({ known: false });
    }
  });
});

describe("tenant isolation — the caller belongs to ONE shop", () => {
  it("never returns another shop's customer for the same number", async () => {
    const c = await resolveCustomer(SHOP_B, PHONE, { name: "Dwayne Leon" });
    await prisma.customer.update({ where: { id: c!.id }, data: { bookingCount: 3 } });

    // Shop B knows them...
    expect((await lookupCallerContext(SHOP_B, PHONE)).first_name).toBe("Dwayne");
    // ...and shop A, which this person has never called, must not.
    expect(await lookupCallerContext(SHOP_A, PHONE)).toEqual({ known: false });
  });
});

describe("what gets disclosed", () => {
  async function seedKnown(over: Record<string, unknown> = {}) {
    const c = await resolveCustomer(SHOP_A, PHONE, { name: "Dwayne Leon" });
    await prisma.customer.update({
      where: { id: c!.id },
      data: {
        bookingCount: 2,
        callCount: 5,
        lifetimeValue: 250_00,
        notes: "difficult about pricing",
        email: "dwayne@example.com",
        addressLine: "412 Oak St",
        lastContactAt: new Date(),
        ...over,
      },
    });
    return c!.id;
  }

  it("greets with the FIRST name only — never the surname", async () => {
    await seedKnown();
    const ctx = await lookupCallerContext(SHOP_A, PHONE);
    expect(ctx.first_name).toBe("Dwayne");
    expect(JSON.stringify(ctx)).not.toContain("Leon");
  });

  it("never leaks money, notes, contact details or the phone number itself", async () => {
    // Caller ID doesn't prove identity — a spouse or a recycled number reaches
    // this same record, and everything here is read out loud.
    await seedKnown();
    const blob = JSON.stringify(await lookupCallerContext(SHOP_A, PHONE));
    for (const secret of ["250", "difficult", "dwayne@example.com", "412 Oak", "7605550101", "+1760"]) {
      expect(blob, `leaked ${secret}`).not.toContain(secret);
    }
  });

  it("returns the vehicle so the agent can ask 'about the Silverado again?'", async () => {
    const id = await seedKnown();
    await prisma.customerAsset.create({ data: { customerId: id, kind: "vehicle", label: "2018 Silverado" } });
    const ctx = await lookupCallerContext(SHOP_A, PHONE);
    expect(ctx.assets).toEqual(["2018 Silverado"]);
  });

  it("marks someone who has only ever called as not returning", async () => {
    await seedKnown({ bookingCount: 0 });
    const ctx = await lookupCallerContext(SHOP_A, PHONE);
    expect(ctx.known).toBe(true);
    expect(ctx.returning).toBe(false);
  });
});

describe("when NOT to recognise someone", () => {
  it("stays quiet about a customer the owner marked lost", async () => {
    const c = await resolveCustomer(SHOP_A, PHONE, { name: "Dwayne Leon" });
    await prisma.customer.update({ where: { id: c!.id }, data: { stage: "lost" } });
    expect(await lookupCallerContext(SHOP_A, PHONE)).toEqual({ known: false });
  });

  it("stays quiet about a do-not-contact customer", async () => {
    const c = await resolveCustomer(SHOP_A, PHONE, { name: "Dwayne Leon" });
    await prisma.customer.update({ where: { id: c!.id }, data: { doNotContact: true } });
    expect(await lookupCallerContext(SHOP_A, PHONE)).toEqual({ known: false });
  });

  it("stays quiet when the record is years stale", async () => {
    // Greeting someone by name over a three-year-old record is more likely to
    // be wrong (number reassigned) than charming.
    const c = await resolveCustomer(SHOP_A, PHONE, { name: "Dwayne Leon" });
    await prisma.customer.update({
      where: { id: c!.id },
      data: { lastContactAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 3) },
    });
    expect(await lookupCallerContext(SHOP_A, PHONE)).toEqual({ known: false });
  });
});

describe("upcoming appointments", () => {
  it("surfaces an appointment they already hold, so we don't double-book", async () => {
    const c = await resolveCustomer(SHOP_A, PHONE, { name: "Dwayne Leon" });
    const soon = new Date(Date.now() + 1000 * 60 * 60 * 48);
    await prisma.booking.create({
      data: {
        shopId: SHOP_A,
        customerId: c!.id,
        startUtc: soon,
        endUtc: new Date(soon.getTime() + 3_600_000),
        status: "confirmed",
        service: "Oil change",
      },
    });
    const ctx = await lookupCallerContext(SHOP_A, PHONE);
    expect(ctx.upcoming?.service).toBe("Oil change");
  });

  it("does not treat a past appointment as upcoming", async () => {
    const c = await resolveCustomer(SHOP_A, PHONE, { name: "Dwayne Leon" });
    const past = new Date(Date.now() - 1000 * 60 * 60 * 48);
    await prisma.booking.create({
      data: {
        shopId: SHOP_A,
        customerId: c!.id,
        startUtc: past,
        endUtc: new Date(past.getTime() + 3_600_000),
        status: "confirmed",
        service: "Brake job",
      },
    });
    const ctx = await lookupCallerContext(SHOP_A, PHONE);
    expect(ctx.upcoming).toBeUndefined();
    expect(ctx.last_service).toBe("Brake job");
  });
});

describe("relativeMonths — phrasing a person would say", () => {
  const now = new Date("2026-08-15T12:00:00Z").getTime();
  const ago = (days: number) => new Date(now - days * 86_400_000);

  it("uses natural phrases, never a raw date", () => {
    expect(relativeMonths(ago(1), now)).toBe("yesterday");
    expect(relativeMonths(ago(5), now)).toBe("5 days ago");
    expect(relativeMonths(ago(21), now)).toBe("about 3 weeks ago");
    expect(relativeMonths(ago(120), now)).toBe("about 4 months ago");
    expect(relativeMonths(ago(365 * 3), now)).toBe("over 3 years ago");
  });
});

describe("callerPhoneFromToolBody — the shape Retell actually sends", () => {
  let callerPhoneFromToolBody: typeof import("./caller-context").callerPhoneFromToolBody;
  beforeAll(async () => {
    callerPhoneFromToolBody = (await import("./caller-context")).callerPhoneFromToolBody;
  });

  it("reads the argument out of `args`, where Retell nests it", () => {
    // The bug this exists for: the route read body.phone directly, which is
    // always undefined. A real call invoked the tool with the correct number
    // and still got known:false, because the route discarded it. Verified
    // against a live transcript: arguments arrived as {"phone":"+1..."} under
    // `args`, and app/api/agent/create-booking already handled that shape.
    expect(callerPhoneFromToolBody({ name: "lookup_customer", args: { phone: "+14106934140" } })).toBe("+14106934140");
  });

  it("prefers the telephony from_number over whatever the model passed", () => {
    // Call metadata is ground truth; the argument is the model repeating back a
    // value it was told, and it can be wrong.
    const body = { call: { from_number: "+14106934140" }, args: { phone: "+19999999999" } };
    expect(callerPhoneFromToolBody(body)).toBe("+14106934140");
  });

  it("falls back to call metadata when the model omits the argument entirely", () => {
    expect(callerPhoneFromToolBody({ call: { from_number: "+14106934140" }, args: {} })).toBe("+14106934140");
  });

  it("still accepts a flat body, so a simpler caller isn't broken", () => {
    expect(callerPhoneFromToolBody({ phone: "+14106934140" })).toBe("+14106934140");
  });

  it("returns null rather than a junk value when there's nothing usable", () => {
    for (const body of [{}, null, undefined, { args: {} }, { args: { phone: "" } }, { args: { phone: "   " } }, { call: {} }]) {
      expect(callerPhoneFromToolBody(body)).toBeNull();
    }
  });

  it("ignores a non-string argument instead of coercing it", () => {
    expect(callerPhoneFromToolBody({ args: { phone: 14106934140 } })).toBeNull();
  });
});
