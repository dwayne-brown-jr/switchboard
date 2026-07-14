import { describe, expect, it } from "vitest";
import { VERTICALS, VERTICAL_DEFS, verticalDef } from "./verticals";
import { TEMPLATES } from "./templates";
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
