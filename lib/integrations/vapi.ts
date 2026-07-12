import "server-only";
import type { VoiceProvider, CreateAgentArgs } from "./voice";

// Vapi integration — behind the same VoiceProvider interface as Retell. Only
// used when VAPI_API_KEY is set and RETELL_API_KEY is not. Kept minimal; expand
// when/if Vapi becomes the active provider.

const BASE = "https://api.vapi.ai";

const VOICE_MAP: Record<string, string> = {
  cimo: "jennifer",
  aria: "sarah",
  marcus: "mark",
  june: "hana",
  theo: "elliot",
  nova: "paige",
};

function key(): string {
  const k = process.env.VAPI_API_KEY;
  if (!k) throw new Error("VAPI_API_KEY not set");
  return k;
}

async function api<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Vapi ${method} ${path} failed (${res.status}): ${await res.text().catch(() => "")}`);
  return (await res.json()) as T;
}

export function createVapiProvider(): VoiceProvider {
  return {
    name: "vapi",
    async createAgent(args: CreateAgentArgs) {
      const assistant = await api<{ id: string }>("/assistant", "POST", {
        name: `sb_${args.shopId}`,
        firstMessage: args.greeting,
        model: { provider: "anthropic", messages: [{ role: "system", content: args.systemPrompt }] },
        voice: { provider: "11labs", voiceId: VOICE_MAP[args.voice] ?? VOICE_MAP.cimo },
        serverUrl: args.webhookUrl,
        metadata: { shopId: args.shopId },
      });
      return { agentId: assistant.id };
    },
    async updateAgent(agentId, args) {
      await api(`/assistant/${agentId}`, "PATCH", {
        ...(args.greeting ? { firstMessage: args.greeting } : {}),
        ...(args.systemPrompt ? { model: { provider: "anthropic", messages: [{ role: "system", content: args.systemPrompt }] } } : {}),
        ...(args.voice ? { voice: { provider: "11labs", voiceId: VOICE_MAP[args.voice] ?? VOICE_MAP.cimo } } : {}),
      });
    },
    async pauseAgent() {},
    async resumeAgent() {},
    async deleteAgent(agentId) {
      await api(`/assistant/${agentId}`, "DELETE").catch(() => {});
    },
  };
}
