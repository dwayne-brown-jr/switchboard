import { describe, expect, it } from "vitest";
import { VERTICALS, VERTICAL_DEFS, verticalDef } from "./verticals";
import { TEMPLATES } from "./templates";
import { fillTemplate, unresolvedTokens } from "./llm";
import { fuzzyMatchKey } from "./match-service";

// Cross-vertical sanity: every advertised business type must have a complete,
// self-consistent definition — the GO-LIVE Gate B "onboarding correctness
// across verticals" check. A new vertical that misses any of these would
// produce a broken agent for that business type.

describe("every vertical definition is complete", () => {
  for (const v of VERTICALS) {
    const def = VERTICAL_DEFS[v];

    it(`${v}: has services, booking fields, hot-job rules, and FAQs`, () => {
      expect(def.services.length).toBeGreaterThan(0);
      expect(def.services.some((s) => s.bookable)).toBe(true);
      expect(def.bookingFields.length).toBeGreaterThan(0);
      expect(def.hotJobRules.length).toBeGreaterThan(0);
      expect(def.faqs.length).toBeGreaterThan(0);
      expect(def.avgTicket).toBeGreaterThan(0);
    });

    it(`${v}: serviceValueMap stays in lockstep with the service catalog`, () => {
      const names = def.services.map((s) => s.service);
      // Every service has a revenue estimate, and no orphan estimates linger
      // after a catalog rename.
      expect(Object.keys(def.serviceValueMap).sort()).toEqual([...names].sort());
    });

    it(`${v}: every catalog service still resolves when spoken without punctuation`, () => {
      const names = def.services.map((s) => s.service);
      for (const name of names) {
        // How a transcript renders it: "Move-in / move-out cleaning" arrives
        // as "move in move out cleaning".
        const spoken = name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
        expect(fuzzyMatchKey(names, spoken), `"${spoken}"`).toBe(name);
      }
    });

    it(`${v}: has a prompt template with the recording disclosure`, () => {
      const template = TEMPLATES[v];
      expect(template).toBeTruthy();
      expect(template).toContain("DISCLOSURE");
    });

    it(`${v}: booking fields always include the essentials`, () => {
      expect(def.bookingFields).toContain("customer_name");
      expect(def.bookingFields).toContain("phone");
      expect(def.bookingFields).toContain("preferred_time");
    });
  }
});

describe("verticalDef fallback", () => {
  it("returns the auto definition for unknown vertical strings", () => {
    expect(verticalDef("not-a-real-vertical").id).toBe("auto");
    expect(verticalDef("").id).toBe("auto");
  });

  it("returns the right definition for every known vertical", () => {
    for (const v of VERTICALS) expect(verticalDef(v).id).toBe(v);
  });
});

describe("fillTemplate leaves no {TOKEN} unsubstituted", () => {
  // Regression guard, added after a live agent shipped a prompt telling callers
  // "Thanks for calling {BUSINESS_NAME}".
  //
  // The cause was ordering, not a typo: fillTemplate ran its replaceAll chain on
  // the vertical template and THEN appended the RETURNING CALLER and HANDING OFF
  // guardrail sections, so any token inside those appended blocks was never
  // reachable by the substitution. Nothing failed — the prompt just went out
  // with a curly-brace placeholder the receptionist read aloud.
  //
  // Asserting across every vertical, on the FULLY composed prompt, is what makes
  // that unrepeatable.
  const config = {
    vertical: "auto",
    business_name: "Riverside Auto Care",
    city: "Austin",
    service_area: "Greater Austin",
    greeting: "Thanks for calling!",
    hours: { mon: { open: "08:00", close: "17:00", closed: false } },
    services: [{ service: "Oil change", bookable: true }],
    price_ranges: {} as Record<string, string>,
    faqs: [{ q: "Do you do brakes?", a: "Yes." }],
    hot_job_rules: ["Smoke from the engine"],
    booking_fields: ["customer_name", "phone", "preferred_time"],
    escalation: { alert_number: "+15125550100" },
  };

  for (const v of VERTICALS) {
    it(`${v}: renders with no leftover placeholder`, () => {
      const prompt = fillTemplate({ ...config, vertical: v } as never);
      expect(unresolvedTokens(prompt), `unsubstituted in ${v}`).toEqual([]);
    });

    it(`${v}: keeps Retell's {{user_number}} intact`, () => {
      // Double-brace variables are substituted by RETELL at call time, not by
      // fillTemplate. The agent needs this one to have any value to pass to
      // lookup_customer's required `phone` arg — its absence is why the first
      // live test called no tool at all. It must survive rendering verbatim,
      // and must NOT be reported as an unresolved {TOKEN}.
      const prompt = fillTemplate({ ...config, vertical: v } as never);
      expect(prompt).toContain("{{user_number}}");
      expect(unresolvedTokens(prompt)).toEqual([]);
    });

    it(`${v}: never tells the agent to act BEFORE the greeting`, () => {
      // Retell speaks begin_message before the model runs, so any instruction
      // to do something "before you greet" is unfollowable by construction.
      const prompt = fillTemplate({ ...config, vertical: v } as never);
      expect(prompt).not.toMatch(/[Bb]efore you greet/);
    });

    it(`${v}: the appended guardrail sections are present AND rendered`, () => {
      const prompt = fillTemplate({ ...config, vertical: v } as never);
      // Both sections are appended after the template, so they're exactly the
      // blocks the ordering bug hid.
      expect(prompt).toContain("RETURNING CALLER");
      expect(prompt).toContain("HANDING OFF TO A PERSON");
      expect(prompt).toContain("Riverside Auto Care");
      expect(prompt).not.toContain("{BUSINESS_NAME}");
    });
  }
});
