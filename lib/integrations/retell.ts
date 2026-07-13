import "server-only";
import type { VoiceProvider, CreateAgentArgs } from "./voice";

// Retell integration (primary voice provider). Real REST calls when
// RETELL_API_KEY is set. NOTE: voice IDs and exact field names should be
// confirmed against your Retell account on first live test — the flow is
// exercised via the mock provider until then.

const BASE = "https://api.retellai.com";

// Post-call analysis schema — tells Retell's post-call LLM to extract these into
// call_analysis.custom_analysis_data, which /api/agent/call-events reads to build
// the CallRecord (booked/emergency/service/value drive the dashboard + alerts).
// Without this, those fields are never populated and every call reads no_action.
export const POST_CALL_ANALYSIS = [
  { type: "boolean", name: "booked", description: "True if the caller booked or confirmed an appointment on this call." },
  { type: "boolean", name: "emergency", description: "True if the caller described an emergency or urgent situation." },
  { type: "boolean", name: "message", description: "True if the call ended with a message taken for the owner (no booking, not an emergency)." },
  { type: "boolean", name: "after_hours", description: "True if the call happened outside the business's normal hours." },
  { type: "boolean", name: "recovered", description: "True if this was a missed call that was recovered (called/texted back)." },
  { type: "string", name: "intent", description: "A short phrase for why the caller called (e.g. 'booking', 'price question')." },
  { type: "string", name: "service", description: "The service the caller booked or asked about, if any." },
  { type: "string", name: "appt_time", description: "The appointment time booked as ISO 8601, if any." },
  { type: "number", name: "est_job_value", description: "Estimated dollar value of the booked job as a whole number, else 0." },
];

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

function toRetellTools(args: CreateAgentArgs): Record<string, unknown>[] {
  const tools: Record<string, unknown>[] = args.functions.map((f) => ({
    type: "custom",
    name: f.name,
    description: f.description,
    url: f.url,
    ...(f.parameters ? { parameters: f.parameters } : {}),
    speak_during_execution: f.name === "check_availability",
    speak_after_execution: true,
  }));
  // Live human handoff — connect the caller to a person when the agent can't
  // help. Cold transfer to the owner's number (must NOT be the forwarded
  // business line, or it would loop back to the agent).
  if (args.transferNumber) {
    tools.push({
      type: "transfer_call",
      name: "transfer_to_human",
      description:
        "Connect the caller to a live person at the business. Use ONLY when the caller needs something you genuinely cannot do, or explicitly asks for a person — and only after collecting their name, callback number, and reason.",
      transfer_destination: { type: "predefined", number: args.transferNumber },
      transfer_option: { type: "cold_transfer" },
    });
  }
  return tools;
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
      const toolList = toRetellTools(args);
      const tools = toolList.length ? { general_tools: toolList } : {};
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
        post_call_analysis_data: POST_CALL_ANALYSIS,
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
