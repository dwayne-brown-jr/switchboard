import "server-only";
import type { VoiceProvider, CreateAgentArgs } from "./voice";

// Mock implementations used when a vendor key isn't configured yet, so the full
// onboarding flow runs end-to-end during development. All IDs are deterministic
// (sb_{shopId}) so retries never "double-create" — same as the real handlers.

export function createMockVoiceProvider(): VoiceProvider {
  return {
    name: "mock",
    async createAgent(args: CreateAgentArgs) {
      return { agentId: `sb_${args.shopId}`, number: undefined };
    },
    async updateAgent() {},
    async pauseAgent() {},
    async resumeAgent() {},
    async deleteAgent() {},
    // Reports itself as perfectly in sync — the mock has no real config to
    // drift from, and a dev environment shouldn't page anyone about it.
    async describeAgent() {
      const { agentFunctions } = await import("./agentTools");
      const { POST_CALL_ANALYSIS } = await import("./retell");
      return {
        toolNames: agentFunctions("mock").map((f) => f.name),
        analysisFields: POST_CALL_ANALYSIS.map((f) => f.name),
        systemPrompt: "",
      };
    },
  };
}
