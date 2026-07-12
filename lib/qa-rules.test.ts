import { describe, it, expect } from "vitest";
import { deterministicQa, looksLikeExactPrice } from "./qa-rules";
import type { ShopConfig } from "./schemas";

// A config that should pass every blocking rule, plus a prompt that mentions the
// one booking field. Each test clones this and breaks exactly one thing.
function goodConfig(): ShopConfig {
  return {
    client_id: "shop_1",
    business_name: "Riverside Auto",
    vertical: "auto",
    city: "Riverside",
    service_area: "Riverside County",
    timezone: "America/Los_Angeles",
    services: [{ service: "Oil change", priceRange: "$45–$90", bookable: true }],
    price_ranges: { "Oil change": "$45–$90" },
    booking_fields: ["name"],
    faqs: [{ q: "Do you take walk-ins?", a: "Yes, before noon." }],
    hot_job_rules: ["no brakes"],
    escalation: { alert_number: "+15551234567", rules: [] },
    service_value_map: {},
    calendar_id: "cal_1",
    owner_phone: "+15557654321",
    business_number: "+15550000000",
    agent_number: "+15551112222",
    voice: "11labs-Marissa",
    greeting: "Thanks for calling Riverside Auto.",
    missing: [],
  } as unknown as ShopConfig;
}

const PROMPT = "Collect the caller's name before booking.";

describe("deterministicQa — blocking rules", () => {
  it("passes a complete, well-formed config", () => {
    const { critical, flags } = deterministicQa(PROMPT, goodConfig());
    expect(critical).toBe(false);
    expect(flags).toHaveLength(0);
  });

  it("blocks when city is missing (timezone ambiguity)", () => {
    const c = goodConfig();
    c.city = null;
    expect(deterministicQa(PROMPT, c).critical).toBe(true);
  });

  it("blocks when there is no escalation alert number", () => {
    const c = goodConfig();
    c.escalation.alert_number = null;
    expect(deterministicQa(PROMPT, c).critical).toBe(true);
  });

  it("blocks when no emergency (hot-job) rules are defined", () => {
    const c = goodConfig();
    c.hot_job_rules = [];
    expect(deterministicQa(PROMPT, c).critical).toBe(true);
  });

  it("blocks an exact single price (never promise a precise quote)", () => {
    const c = goodConfig();
    c.price_ranges = { "Oil change": "$60" };
    expect(deterministicQa(PROMPT, c).critical).toBe(true);
  });

  it("blocks when no service is bookable", () => {
    const c = goodConfig();
    c.services = [{ service: "Oil change", priceRange: "$45–$90", bookable: false }];
    expect(deterministicQa(PROMPT, c).critical).toBe(true);
  });

  it("blocks when a required booking field is not collected in the prompt", () => {
    const c = goodConfig();
    c.booking_fields = ["vehicle_year"];
    expect(deterministicQa("This prompt never asks for it.", c).critical).toBe(true);
  });

  it("does NOT block on missing FAQ answers (advisory only)", () => {
    const c = goodConfig();
    c.faqs = [{ q: "Do you take walk-ins?", a: "" }];
    const { critical, flags } = deterministicQa(PROMPT, c);
    expect(critical).toBe(false);
    expect(flags.length).toBeGreaterThan(0); // advisory flag present
  });
});

describe("looksLikeExactPrice", () => {
  it.each(["$60", "$100", "120"])("flags exact amount %s", (p) => {
    expect(looksLikeExactPrice(p)).toBe(true);
  });
  it.each(["$45–$90", "$45-$90", "from $45", "starting at $99", "$45+", "up to $200", ""])(
    "accepts range/blank %s",
    (p) => {
      expect(looksLikeExactPrice(p)).toBe(false);
    },
  );
});
