import { describe, it, expect } from "vitest";
import { diffAgentConfig, summarizeDrift, type ExpectedConfig } from "./agent-drift";

// The drift checker exists because config defined in code twice reached only
// newly-provisioned shops — tools, then post-call analysis fields — and neither
// failure was visible from inside the app.
//
// So the cases below are not hypothetical. Each of the first two is a real
// production incident, reproduced.

const SHOP = { id: "shop_1", businessName: "Riverside Auto Care" };

const expected: ExpectedConfig = {
  toolNames: ["lookup_customer", "check_availability", "create_booking", "notify_owner"],
  analysisFields: ["booked", "service", "asset", "customer_name"],
  promptSections: ["ROLE", "RETURNING CALLER", "CLOSING"],
};

const healthy = {
  toolNames: ["lookup_customer", "check_availability", "create_booking", "notify_owner", "transfer_to_human"],
  analysisFields: ["booked", "service", "asset", "customer_name"],
  systemPrompt: "ROLE\n…\nRETURNING CALLER\n…\nCLOSING\nThanks for calling Riverside Auto Care.",
};

describe("an agent that matches the code", () => {
  it("reports nothing", () => {
    expect(diffAgentConfig(SHOP, expected, healthy)).toEqual([]);
  });

  it("does not flag transfer_to_human, which is configured elsewhere", () => {
    // It comes from the transfer/number layer, not agentFunctions, so it is
    // legitimately present and legitimately unlisted.
    expect(diffAgentConfig(SHOP, expected, healthy).some((i) => i.detail.includes("transfer_to_human"))).toBe(false);
  });
});

describe("incident 1 — a tool that only reached new shops", () => {
  it("catches a missing tool", () => {
    const actual = { ...healthy, toolNames: healthy.toolNames.filter((t) => t !== "lookup_customer") };
    const issues = diffAgentConfig(SHOP, expected, actual);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("missing_tool");
    expect(issues[0].detail).toContain("lookup_customer");
    expect(issues[0].businessName).toBe("Riverside Auto Care");
  });
});

describe("incident 2 — an analysis field that only reached new shops", () => {
  it("catches a missing analysis field", () => {
    // The quieter of the two: no error, the value just never arrives and the
    // ingest code reading it sits dead.
    const actual = { ...healthy, analysisFields: ["booked", "service"] };
    const issues = diffAgentConfig(SHOP, expected, actual);
    expect(issues.map((i) => i.kind)).toEqual(["missing_analysis_field", "missing_analysis_field"]);
    expect(issues.map((i) => i.detail).join(" ")).toContain("asset");
    expect(issues.map((i) => i.detail).join(" ")).toContain("customer_name");
  });
});

describe("incident 3 — a placeholder that reached a live agent", () => {
  it("catches an unsubstituted token the agent would read aloud", () => {
    const actual = { ...healthy, systemPrompt: "ROLE\nRETURNING CALLER\nCLOSING\nThanks for calling {BUSINESS_NAME}." };
    const issues = diffAgentConfig(SHOP, expected, actual);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("unresolved_token");
    expect(issues[0].detail).toContain("{BUSINESS_NAME}");
  });

  it("does not mistake Retell's own {{double brace}} variables for our tokens", () => {
    // {{user_number}} is substituted by the platform at call time and MUST
    // survive in the stored prompt. Flagging it would make the check cry wolf
    // on every healthy agent.
    const actual = { ...healthy, systemPrompt: `${healthy.systemPrompt}\nThe caller's number is {{user_number}}.` };
    expect(diffAgentConfig(SHOP, expected, actual)).toEqual([]);
  });
});

describe("prompt sections", () => {
  it("catches a guardrail section missing from the live prompt", () => {
    const actual = { ...healthy, systemPrompt: "ROLE\nCLOSING" };
    const issues = diffAgentConfig(SHOP, expected, actual);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("missing_prompt_section");
    expect(issues[0].detail).toContain("RETURNING CALLER");
  });

  it("skips prompt checks entirely when the prompt couldn't be read", () => {
    // An empty prompt means we failed to read it, not that every section is
    // missing. Reporting three failures for one unknown is noise.
    const actual = { ...healthy, systemPrompt: "" };
    expect(diffAgentConfig(SHOP, expected, actual)).toEqual([]);
  });
});

describe("extra tools", () => {
  it("reports a leftover tool separately from a missing one", () => {
    // Untidy, not broken — a tool from an older deploy. Worth seeing, not worth
    // treating as an outage.
    const actual = { ...healthy, toolNames: [...healthy.toolNames, "old_tool"] };
    const issues = diffAgentConfig(SHOP, expected, actual);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("extra_tool");
  });
});

describe("summarizeDrift", () => {
  it("says so plainly when everything matches", () => {
    expect(summarizeDrift([])).toContain("match the code");
  });

  it("names the shops and counts the issues", () => {
    const issues = diffAgentConfig(SHOP, expected, { ...healthy, toolNames: [] });
    const s = summarizeDrift(issues);
    expect(s).toContain("Riverside Auto Care");
    expect(s).toContain("4 config drift issue");
  });

  it("truncates so a broad regression can't produce an unreadable alert", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      shopId: `s${i}`,
      businessName: `Shop ${i}`,
      kind: "missing_tool" as const,
      detail: "tool missing",
    }));
    const s = summarizeDrift(many);
    expect(s).toContain("and 28 more");
    expect(s.split("\n").length).toBeLessThan(16);
  });
});
