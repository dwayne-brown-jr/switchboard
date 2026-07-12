import "server-only";
import { createRetellProvider } from "./retell";
import { createVapiProvider } from "./vapi";
import { createMockVoiceProvider } from "./mock";

// One interface, swappable providers. Retell is primary; Vapi sits behind the
// same shape; a mock provider lets the full onboarding flow run and be tested
// before any real voice key exists (returns deterministic sb_{shopId} IDs).

export interface CreateAgentArgs {
  shopId: string;
  systemPrompt: string;
  voice: string;
  greeting: string;
  /** Tool endpoints the agent calls (native /api/agent routes). */
  functions: AgentFunction[];
  webhookUrl: string;
}

export interface AgentFunction {
  name: "check_availability" | "create_booking" | "notify_owner";
  url: string;
  description: string;
  /** JSON-schema of the args the LLM should extract and send. */
  parameters?: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export interface VoiceProvider {
  readonly name: string;
  createAgent(args: CreateAgentArgs): Promise<{ agentId: string; number?: string }>;
  updateAgent(agentId: string, args: Partial<CreateAgentArgs>): Promise<void>;
  pauseAgent(agentId: string): Promise<void>;
  resumeAgent(agentId: string): Promise<void>;
  deleteAgent(agentId: string): Promise<void>;
}

/** The provider to use for NEW provisioning: Retell if keyed, else mock. */
export function defaultVoiceProvider(): VoiceProvider {
  if (process.env.RETELL_API_KEY) return createRetellProvider();
  if (process.env.VAPI_API_KEY) return createVapiProvider();
  return createMockVoiceProvider();
}

/** Resolve a provider by the name stored on a shop (for pause/update/delete). */
export function getVoiceProvider(name: string): VoiceProvider {
  switch (name) {
    case "retell":
      return process.env.RETELL_API_KEY ? createRetellProvider() : createMockVoiceProvider();
    case "vapi":
      return process.env.VAPI_API_KEY ? createVapiProvider() : createMockVoiceProvider();
    default:
      return createMockVoiceProvider();
  }
}
