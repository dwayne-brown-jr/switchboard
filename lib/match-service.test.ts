import { describe, it, expect } from "vitest";
import { fuzzyMatchKey } from "./match-service";

const KEYS = ["Oil change", "Brake service", "Check-engine / diagnostics", "A/C service", "Tire rotation", "State inspection"];

describe("fuzzyMatchKey", () => {
  it("exact and case-insensitive", () => {
    expect(fuzzyMatchKey(KEYS, "Oil change")).toBe("Oil change");
    expect(fuzzyMatchKey(KEYS, "brake service")).toBe("Brake service");
  });

  it("matches verbose caller phrasing (the real test-call case)", () => {
    expect(fuzzyMatchKey(KEYS, "Routine maintenance and oil change for 2018 BMW X5")).toBe("Oil change");
    expect(fuzzyMatchKey(KEYS, "brakes")).toBe("Brake service");
    expect(fuzzyMatchKey(KEYS, "check engine light")).toBe("Check-engine / diagnostics");
  });

  it("returns undefined on ambiguity, no match, or empty", () => {
    expect(fuzzyMatchKey(KEYS, "service")).toBeUndefined(); // Brake service & A/C service tie
    expect(fuzzyMatchKey(KEYS, "window tint")).toBeUndefined();
    expect(fuzzyMatchKey(KEYS, "")).toBeUndefined();
    expect(fuzzyMatchKey(KEYS, null)).toBeUndefined();
  });
});

// Caller phrasing across the OTHER advertised verticals (GO-LIVE Gate B:
// "verified for auto repair — sanity-check the rest"). Keys mirror
// VERTICAL_DEFS service catalogs.
describe("fuzzyMatchKey across verticals", () => {
  it("hvac", () => {
    const keys = ["Repair / service call", "Seasonal maintenance / tune-up", "New system estimate", "Thermostat install", "Indoor air quality consult"];
    expect(fuzzyMatchKey(keys, "AC tune up")).toBe("Seasonal maintenance / tune-up");
    expect(fuzzyMatchKey(keys, "install a thermostat")).toBe("Thermostat install");
    expect(fuzzyMatchKey(keys, "estimate on a new system")).toBe("New system estimate");
    // "new" also appears in "New system estimate" → tie → stays unresolved
    // (booking keeps the caller's words rather than guessing).
    expect(fuzzyMatchKey(keys, "need a new thermostat put in")).toBeUndefined();
  });

  it("cleaning", () => {
    const keys = ["Standard cleaning", "Deep cleaning", "Move-in / move-out cleaning", "Recurring cleaning (weekly/biweekly)", "Post-construction cleaning"];
    expect(fuzzyMatchKey(keys, "a deep clean of the whole house")).toBe("Deep cleaning");
    expect(fuzzyMatchKey(keys, "move out clean before my lease ends")).toBe("Move-in / move-out cleaning");
    expect(fuzzyMatchKey(keys, "weekly recurring cleaning")).toBe("Recurring cleaning (weekly/biweekly)");
    // Bare "cleaning" ties every service — must stay unresolved, not mis-book.
    expect(fuzzyMatchKey(keys, "cleaning")).toBeUndefined();
  });

  it("auto detailing & customization", () => {
    const keys = ["Full detail (interior + exterior)", "Interior deep clean", "Ceramic coating", "Window tint", "Vehicle wrap", "Paint protection film (PPF)", "Headlight restoration"];
    expect(fuzzyMatchKey(keys, "ceramic coating for my truck")).toBe("Ceramic coating");
    expect(fuzzyMatchKey(keys, "tint my windows")).toBe("Window tint");
    expect(fuzzyMatchKey(keys, "wrap my car")).toBe("Vehicle wrap");
    expect(fuzzyMatchKey(keys, "PPF")).toBe("Paint protection film (PPF)");
    // No verb stemming ("wrapped" ≠ "wrap") — unresolved, keeps caller's words.
    expect(fuzzyMatchKey(keys, "get the car wrapped")).toBeUndefined();
  });

  it("home services", () => {
    const keys = ["Diagnostic / estimate visit", "Scheduled repair job", "Drain cleaning", "Water heater service", "Electrical repair"];
    expect(fuzzyMatchKey(keys, "my water heater is acting up")).toBe("Water heater service");
    expect(fuzzyMatchKey(keys, "clogged drain needs cleaning")).toBe("Drain cleaning");
    expect(fuzzyMatchKey(keys, "come out and give me an estimate")).toBe("Diagnostic / estimate visit");
    expect(fuzzyMatchKey(keys, "repair")).toBeUndefined(); // repair job vs electrical repair tie
  });

  it("other local service", () => {
    const keys = ["Service call / appointment", "Estimate / quote visit", "Recurring service"];
    expect(fuzzyMatchKey(keys, "get a quote")).toBe("Estimate / quote visit");
    expect(fuzzyMatchKey(keys, "set up recurring service")).toBe("Recurring service");
    // Every key contains "service"-adjacent tokens — bare asks must not guess.
    expect(fuzzyMatchKey(keys, "service")).toBeUndefined();
  });
});
