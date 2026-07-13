// Enable live human handoff on an EXISTING Retell agent (for shops provisioned
// before the feature). Adds a transfer_call tool (dedup by name) and appends the
// HANDING OFF section to the LLM prompt if missing. New shops get this at
// provisioning; this is only for back-filling live agents.
//
//   RETELL_API_KEY=... node scripts/enable-transfer.mjs <agentId> <+E164number>
import crypto from "node:crypto"; // eslint-disable-line no-unused-vars

const [agentId, number] = process.argv.slice(2);
if (!agentId || !/^\+\d{8,15}$/.test(number || "")) throw new Error("usage: enable-transfer.mjs <agentId> <+E164number>");
const KEY = process.env.RETELL_API_KEY;
if (!KEY) throw new Error("RETELL_API_KEY required");

const HANDOFF = `

HANDING OFF TO A PERSON
Handle the call yourself whenever you reasonably can - booking, listed prices/hours, common questions, taking details. Only involve a human if the caller needs something you genuinely cannot do, or clearly asks to speak to a person.
When you do:
1. First collect their name, a callback number, and a one-line reason.
2. Then tell them you'll connect them now and use the transfer option to reach the team. If you can't connect them, reassure them their details are saved and someone will call right back.
Do NOT hand off for anything you can handle (scheduling, hours, prices in range, common questions).`;

async function api(path, method, body) {
  const res = await fetch(`https://api.retellai.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}

const agent = await api(`/get-agent/${agentId}`, "GET");
const llmId = agent.response_engine?.llm_id || agent.metadata?.llm_id;
if (!llmId) throw new Error("no llm_id on agent");
const llm = await api(`/get-retell-llm/${llmId}`, "GET");

const tools = (llm.general_tools || []).filter((t) => t.name !== "transfer_to_human");
tools.push({
  type: "transfer_call",
  name: "transfer_to_human",
  description:
    "Connect the caller to a live person at the business. Use ONLY when the caller needs something you genuinely cannot do, or explicitly asks for a person - and only after collecting their name, callback number, and reason.",
  transfer_destination: { type: "predefined", number },
  transfer_option: { type: "cold_transfer" },
});

let prompt = llm.general_prompt || "";
if (!prompt.includes("HANDING OFF TO A PERSON")) prompt += HANDOFF;

await api(`/update-retell-llm/${llmId}`, "PATCH", { general_tools: tools, general_prompt: prompt });
console.log(`✓ transfer_to_human → ${number} added; handoff prompt ${llm.general_prompt?.includes("HANDING OFF") ? "already present" : "appended"}`);
console.log("tools now:", tools.map((t) => `${t.name}:${t.type}`).join(", "));
