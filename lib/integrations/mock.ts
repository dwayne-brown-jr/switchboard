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
  };
}
