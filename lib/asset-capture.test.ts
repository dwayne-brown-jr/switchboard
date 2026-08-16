import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { setupTestDb } from "../test/db-harness";

// Capturing the vehicle/property a call was about.
//
// The gap this closes, observed on a live call: the agent recognised the caller
// by name and then immediately asked "what year, make, and model is the
// vehicle?" — for a customer whose Pathfinder was sitting in an old booking as
// free text. We ask for this on nearly every call and used to discard it.
//
// The bar for writing one of these is deliberately high. The label comes from a
// voice model transcribing a phone call, and the agent READS IT BACK to the
// caller — so a wrong or duplicated row is worse than a missing one.

let rememberAssetSafe: typeof import("./ingest").rememberAssetSafe;
let assetKindFor: typeof import("./ingest").assetKindFor;
let resolveCustomer: typeof import("./customer").resolveCustomer;
let prisma: typeof import("./db").prisma;

const SHOP = "shop_a";
const AUTO = { id: SHOP, vertical: "auto" };

beforeAll(async () => {
  ({ prisma } = await setupTestDb("assets"));
  const ingest = await import("./ingest");
  rememberAssetSafe = ingest.rememberAssetSafe;
  assetKindFor = ingest.assetKindFor;
  resolveCustomer = (await import("./customer")).resolveCustomer;

  await prisma.user.create({ data: { id: "u1", email: "o@example.com", emailVerified: true } });
  await prisma.shop.create({ data: { id: SHOP, ownerId: "u1", businessName: "S", vertical: "auto", status: "live" } });
}, 60_000);

beforeEach(async () => {
  await prisma.customerAsset.deleteMany({});
  await prisma.customerPhone.deleteMany({});
  await prisma.customer.deleteMany({});
});

async function newCustomer() {
  const c = await resolveCustomer(SHOP, "7605550101", { name: "Samantha Reed" });
  return c!.id;
}

describe("assetKindFor", () => {
  it("files it under the thing that vertical actually services", () => {
    expect(assetKindFor("auto")).toBe("vehicle");
    expect(assetKindFor("auto_appearance")).toBe("vehicle");
    expect(assetKindFor("hvac")).toBe("equipment");
    expect(assetKindFor("cleaning")).toBe("property");
    expect(assetKindFor(null)).toBe("property");
  });
});

describe("rememberAssetSafe", () => {
  it("records the vehicle the call was about", async () => {
    const id = await newCustomer();
    await rememberAssetSafe(AUTO, id, "2016 Nissan Pathfinder");
    const rows = await prisma.customerAsset.findMany({ where: { customerId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("2016 Nissan Pathfinder");
    expect(rows[0].kind).toBe("vehicle");
  });

  it("does not duplicate on the next call", async () => {
    const id = await newCustomer();
    await rememberAssetSafe(AUTO, id, "2016 Nissan Pathfinder");
    await rememberAssetSafe(AUTO, id, "2016 Nissan Pathfinder");
    expect(await prisma.customerAsset.count({ where: { customerId: id } })).toBe(1);
  });

  it("treats a differently-capitalised transcription as the same vehicle", async () => {
    // The model won't capitalise consistently across calls. Without this the
    // agent ends up reading back two Pathfinders.
    const id = await newCustomer();
    await rememberAssetSafe(AUTO, id, "2016 Nissan Pathfinder");
    await rememberAssetSafe(AUTO, id, "2016 nissan pathfinder");
    await rememberAssetSafe(AUTO, id, "  2016 NISSAN PATHFINDER  ");
    expect(await prisma.customerAsset.count({ where: { customerId: id } })).toBe(1);
  });

  it("keeps a genuinely different second vehicle", async () => {
    const id = await newCustomer();
    await rememberAssetSafe(AUTO, id, "2016 Nissan Pathfinder");
    await rememberAssetSafe(AUTO, id, "2021 BMW X5");
    expect(await prisma.customerAsset.count({ where: { customerId: id } })).toBe(2);
  });

  it("ignores empty, missing and implausibly short labels", async () => {
    const id = await newCustomer();
    for (const junk of [null, undefined, "", "   ", "a", "car"]) {
      await rememberAssetSafe(AUTO, id, junk);
    }
    expect(await prisma.customerAsset.count({ where: { customerId: id } })).toBe(0);
  });

  it("ignores a rambling transcription instead of storing a sentence", async () => {
    const id = await newCustomer();
    await rememberAssetSafe(AUTO, id, "x".repeat(200));
    expect(await prisma.customerAsset.count({ where: { customerId: id } })).toBe(0);
  });

  it("stops at five so noise can't become a fleet the agent reads aloud", async () => {
    const id = await newCustomer();
    for (let i = 0; i < 9; i++) await rememberAssetSafe(AUTO, id, `201${i} Toyota Model${i}`);
    expect(await prisma.customerAsset.count({ where: { customerId: id } })).toBe(5);
  });

  it("never throws, even on a customer that doesn't exist", async () => {
    // It runs inside the call-recording path; an exception here must never cost
    // us the CallRecord.
    await expect(rememberAssetSafe(AUTO, "nope_not_a_customer", "2016 Nissan Pathfinder")).resolves.toBeUndefined();
  });
});
