import "server-only";
import type { VoiceProvider, CreateAgentArgs } from "./voice";

// Retell integration (primary voice provider). Real REST calls when
// RETELL_API_KEY is set. NOTE: voice IDs and exact field names should be
// confirmed against your Retell account on first live test — the flow is
// exercised via the mock provider until then.

const BASE = "https://api.retellai.com";

// Our curated voice ids ARE real Retell voice ids (see lib/verticals.ts VOICES),
// so we pass them straight through. Fallback if a legacy/unknown id sneaks in.
const DEFAULT_VOICE_ID = "11labs-Marissa";
function voiceId(v: string): string {
  return v && v.includes("-") ? v : DEFAULT_VOICE_ID;
}

function key(): string {
  const k = process.env.RETELL_API_KEY;
  if (!k) throw new Error("RETELL_API_KEY not set");
  return k;
}

async function api<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Retell ${method} ${path} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}

function toRetellTools(args: CreateAgentArgs) {
  return args.functions.map((f) => ({
    type: "custom",
    name: f.name,
    description: f.description,
    url: f.url,
    speak_during_execution: f.name === "check_availability",
    speak_after_execution: true,
  }));
}

/** Create a browser web call to an agent — lets an owner test the receptionist
 *  from their browser with no phone number (works even while Twilio is mocked).
 *  `dynamicVariables` personalize a shared agent per call (used by the public
 *  landing-page demo: {{business_name}}, {{city}}, {{primary_service}}). */
export async function createWebCall(
  agentId: string,
  dynamicVariables?: Record<string, string>,
): Promise<{ accessToken: string; callId: string }> {
  const res = await api<{ access_token: string; call_id: string }>("/v2/create-web-call", "POST", {
    agent_id: agentId,
    ...(dynamicVariables ? { retell_llm_dynamic_variables: dynamicVariables } : {}),
  });
  return { accessToken: res.access_token, callId: res.call_id };
}

/** Create a conversation-only demo agent (no tools, no webhook) whose prompt
 *  uses Retell dynamic variables. Returns the agent id to store in env. */
export async function createDemoAgent(args: {
  name: string;
  prompt: string;
  greeting: string;
  voice: string;
}): Promise<{ agentId: string }> {
  const llm = await api<{ llm_id: string }>("/create-retell-llm", "POST", {
    general_prompt: args.prompt,
    begin_message: args.greeting,
  });
  const agent = await api<{ agent_id: string }>("/create-agent", "POST", {
    response_engine: { type: "retell-llm", llm_id: llm.llm_id },
    voice_id: voiceId(args.voice),
    agent_name: args.name,
    metadata: { demo: "true", llm_id: llm.llm_id },
  });
  return { agentId: agent.agent_id };
}

/** Unbind a number from Retell (removes the phone-number import) so inbound
 *  calls stop reaching the agent. Reversible — importPhoneNumber re-binds it.
 *  Used to make Pause / cancel actually stop the receptionist answering. The
 *  underlying Twilio number + SIP trunk are left intact. */
export async function unbindPhoneNumber(phoneNumber: string): Promise<void> {
  await api(`/delete-phone-number/${encodeURIComponent(phoneNumber)}`, "DELETE");
}

/** Import a Twilio number (routed via our SIP trunk) and bind inbound calls to
 *  the shop's agent. Makes the real number actually answer as the receptionist. */
export async function importPhoneNumber(args: {
  phoneNumber: string;
  terminationUri: string;
  username: string;
  password: string;
  agentId: string;
}): Promise<{ phoneNumber: string }> {
  const res = await api<{ phone_number: string }>("/import-phone-number", "POST", {
    phone_number: args.phoneNumber,
    termination_uri: args.terminationUri,
    sip_trunk_auth_username: args.username,
    sip_trunk_auth_password: args.password,
    transport: "TCP",
    inbound_agents: [{ agent_id: args.agentId, weight: 1 }],
  });
  return { phoneNumber: res.phone_number };
}

export function createRetellProvider(): VoiceProvider {
  return {
    name: "retell",

    async createAgent(args: CreateAgentArgs) {
      // 1) Create the Retell LLM (holds the prompt + tools). Tools only when
      //    real (public) tool URLs exist — Retell rejects empty/localhost URLs.
      const tools = args.functions.length ? { general_tools: toRetellTools(args) } : {};
      const llm = await api<{ llm_id: string }>("/create-retell-llm", "POST", {
        general_prompt: args.systemPrompt,
        begin_message: args.greeting,
        ...tools,
      });
      // 2) Create the agent bound to that LLM. webhook_url only if public.
      const agent = await api<{ agent_id: string }>("/create-agent", "POST", {
        response_engine: { type: "retell-llm", llm_id: llm.llm_id },
        voice_id: voiceId(args.voice),
        agent_name: `sb_${args.shopId}`,
        ...(args.webhookUrl ? { webhook_url: args.webhookUrl } : {}),
        metadata: { shopId: args.shopId, llm_id: llm.llm_id },
      });
      return { agentId: agent.agent_id };
    },

    async updateAgent(agentId, args) {
      // Fetch the agent to find its llm_id, then update prompt/voice as needed.
      const agent = await api<{ response_engine?: { llm_id?: string }; metadata?: { llm_id?: string } }>(
        `/get-agent/${agentId}`,
        "GET",
      );
      const llmId = agent.response_engine?.llm_id ?? agent.metadata?.llm_id;
      if (llmId && (args.systemPrompt || args.greeting || args.functions)) {
        await api(`/update-retell-llm/${llmId}`, "PATCH", {
          ...(args.systemPrompt ? { general_prompt: args.systemPrompt } : {}),
          ...(args.greeting ? { begin_message: args.greeting } : {}),
          ...(args.functions ? { general_tools: toRetellTools(args as CreateAgentArgs) } : {}),
        });
      }
      if (args.voice) {
        await api(`/update-agent/${agentId}`, "PATCH", { voice_id: voiceId(args.voice) });
      }
    },

    // Retell has no explicit pause; unbinding the number stops inbound calls.
    // Handled at the number layer (twilio.release/unbind). Here we mark intent.
    async pauseAgent() {
      /* number unbinding handled in lifecycle/number layer */
    },
    async resumeAgent() {
      /* re-bind handled in lifecycle/number layer */
    },

    async deleteAgent(agentId) {
      await api(`/delete-agent/${agentId}`, "DELETE").catch(() => {});
    },
  };
}
