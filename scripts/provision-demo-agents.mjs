// One-off: provision the 3 landing-page demo agents on Retell (conversation-only,
// personalized per call via dynamic variables). Prints DEMO_AGENT_* env lines to
// paste into .env and Vercel. Re-running creates NEW agents (delete old ones in
// the Retell dashboard if you re-provision).
//
//   node scripts/provision-demo-agents.mjs
//
// Prompts below are kept in sync with lib/demo.ts (demoAgentPrompt/greeting).
import { readFileSync } from "node:fs";

const BASE = "https://api.retellai.com";
const VOICE = "11labs-Marissa";

function retellKey() {
  if (process.env.RETELL_API_KEY) return process.env.RETELL_API_KEY;
  try {
    const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const m = env.match(/^RETELL_API_KEY\s*=\s*"?([^"\n]+)"?/m);
    if (m) return m[1].trim();
  } catch {}
  throw new Error("RETELL_API_KEY not found in env or .env");
}
const KEY = retellKey();

async function api(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}

const GREETING = `Thanks for calling {{business_name}}! This is our virtual assistant. How can I help you today?`;
const COMMON = `You are the friendly phone receptionist for {{business_name}}, a local business in {{city}}. You are warm, efficient, and never pushy. This is a live demo, so keep the conversation natural and fairly brief.

DISCLOSURE: If asked whether you are a person, say honestly that you're {{business_name}}'s automated assistant.

RULES
- Never quote an exact price over the phone. Give a rough range only if natural, framed as "typically" or "starting around," and say the team confirms after a look.
- Collect the caller's name and callback number before "booking".
- You can pretend to offer and confirm an appointment time (this is a demo - no real calendar).
- Stay in scope: represent {{business_name}} only.`;

const PROMPTS = {
  auto: `${COMMON}

You are an AUTO REPAIR shop. Their most-booked service is {{primary_service}}. Always confirm the vehicle's year, make, and model and read it back. Never diagnose for certain over the phone - take symptoms and let the tech confirm.`,
  auto_appearance: `${COMMON}

You are an AUTO DETAILING & CUSTOMIZATION shop (detailing, ceramic, tint, wraps). Their most-requested service is {{primary_service}}. Pricing depends on the vehicle's size and condition - never promise an exact number; get them scheduled for a look instead.`,
  hvac: `${COMMON}

You are a HEATING & AIR (HVAC) company. Their most-common call is {{primary_service}}. If the caller describes no heat/cooling in extreme weather, a gas smell, or a vulnerable occupant, treat it as URGENT: reassure them, take their details, and tell them you're alerting the on-call tech immediately.`,
};

for (const [type, prompt] of Object.entries(PROMPTS)) {
  const llm = await api("/create-retell-llm", { general_prompt: prompt, begin_message: GREETING });
  const agent = await api("/create-agent", {
    response_engine: { type: "retell-llm", llm_id: llm.llm_id },
    voice_id: VOICE,
    agent_name: `sb_demo_${type}`,
    // Cost guardrails for a public, unauthenticated demo: hard 3-min cap and
    // hang up after 20s of silence.
    max_call_duration_ms: 180000,
    end_call_after_silence_ms: 20000,
    metadata: { demo: "true", type },
  });
  console.log(`DEMO_AGENT_${type.toUpperCase()}=${agent.agent_id}`);
}
