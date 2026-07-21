// Buy a real, callable phone number per vertical and bind it to that vertical's
// landing-page demo agent — so "call this number and hear it answer" works on a
// cold call, a voicemail, or a postcard. This is the single highest-leverage
// local-GTM asset (see docs/PILOT-OUTREACH.md).
//
//   node scripts/provision-demo-lines.mjs --area 760              # DRY RUN (default)
//   node scripts/provision-demo-lines.mjs --area 760 --confirm    # actually buys
//   node scripts/provision-demo-lines.mjs --area 760 --types auto,hvac --confirm
//
// ⚠️  --confirm SPENDS MONEY: ~$1–2 per number/month (Twilio) plus per-minute
//     call cost when someone calls it. Dry run prints exactly what it would buy.
//
// Idempotent: numbers are tagged FriendlyName=sb_demo_<type>. Re-running finds
// the existing number and re-binds it instead of buying a second one.
import { readFileSync } from "node:fs";

// ---------- env ----------
const env = (() => {
  const out = { ...process.env };
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      if (!line.includes("=") || line.trim().startsWith("#")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (!out[k]) out[k] = v;
    }
  } catch {}
  return out;
})();

const need = (k) => {
  const v = env[k];
  if (!v) throw new Error(`Missing ${k} (set it in .env)`);
  return v;
};

// ---------- args ----------
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
};
const CONFIRM = argv.includes("--confirm");
const AREA = arg("area", "");
const TYPES = arg("types", "auto,hvac,auto_appearance").split(",").map((s) => s.trim()).filter(Boolean);

// Must mirror lib/demo.ts DEMO_TYPES + demoAgentEnvKey.
const LABELS = { auto: "Auto repair", hvac: "Heating & Air", auto_appearance: "Auto detailing" };
const agentEnvKey = (t) => `DEMO_AGENT_${t.toUpperCase()}`;

const TW = "https://api.twilio.com/2010-04-01";
const SID = need("TWILIO_ACCOUNT_SID");
const TOKEN = need("TWILIO_AUTH_TOKEN");
const authHeader = "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64");

async function tw(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Twilio ${method} ${url.split("?")[0]} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function retell(path, method, body) {
  const res = await fetch(`https://api.retellai.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${need("RETELL_API_KEY")}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Retell ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

// ---------- run ----------
console.log(`\nDemo lines — ${CONFIRM ? "\x1b[31mLIVE (will purchase)\x1b[0m" : "DRY RUN (nothing purchased)"}`);
console.log(`Area code: ${AREA || "(any)"}   Types: ${TYPES.join(", ")}\n`);

const results = [];

for (const type of TYPES) {
  const label = LABELS[type] ?? type;
  const agentId = env[agentEnvKey(type)];
  if (!agentId) {
    console.log(`  ✗ ${label.padEnd(16)} skipped — ${agentEnvKey(type)} not set (run provision-demo-agents.mjs first)`);
    continue;
  }

  const friendly = `sb_demo_${type}`;

  // 1) Reuse an existing demo number for this type if we already bought one.
  const existing = await tw(`${TW}/Accounts/${SID}/IncomingPhoneNumbers.json?FriendlyName=${encodeURIComponent(friendly)}`);
  let numberSid = existing.incoming_phone_numbers?.[0]?.sid;
  let phone = existing.incoming_phone_numbers?.[0]?.phone_number;

  if (numberSid) {
    console.log(`  ↻ ${label.padEnd(16)} reusing existing ${phone}`);
  } else {
    // 2) Find one to buy.
    const search = new URL(`${TW}/Accounts/${SID}/AvailablePhoneNumbers/US/Local.json`);
    search.searchParams.set("VoiceEnabled", "true");
    search.searchParams.set("SmsEnabled", "true");
    if (AREA) search.searchParams.set("AreaCode", AREA);
    const avail = await tw(search.toString());
    const pick = avail.available_phone_numbers?.[0]?.phone_number;
    if (!pick) {
      console.log(`  ✗ ${label.padEnd(16)} no numbers available${AREA ? ` in area ${AREA}` : ""}`);
      continue;
    }
    if (!CONFIRM) {
      console.log(`  · ${label.padEnd(16)} would buy ${pick}  →  agent ${agentId.slice(0, 18)}…`);
      results.push({ label, phone: pick, bought: false });
      continue;
    }
    const bought = await tw(`${TW}/Accounts/${SID}/IncomingPhoneNumbers.json`, "POST", {
      PhoneNumber: pick,
      FriendlyName: friendly,
    });
    numberSid = bought.sid;
    phone = bought.phone_number;
    console.log(`  + ${label.padEnd(16)} bought ${phone}`);
  }

  // 3) Route it: Twilio SIP trunk → Retell, bound to this vertical's demo agent.
  const trunkSid = env.TWILIO_SIP_TRUNK_SID;
  if (!trunkSid) {
    console.log(`      ⚠ TWILIO_SIP_TRUNK_SID not set — number bought but NOT routed`);
    results.push({ label, phone, bought: true, routed: false });
    continue;
  }
  await tw(`https://trunking.twilio.com/v1/Trunks/${trunkSid}/PhoneNumbers`, "POST", { PhoneNumberSid: numberSid })
    .catch((e) => console.log(`      ⚠ trunk attach: ${e.message}`));

  await retell("/import-phone-number", "POST", {
    phone_number: phone,
    termination_uri: need("TWILIO_SIP_TERMINATION_URI"),
    sip_trunk_auth_username: env.TWILIO_SIP_USERNAME ?? "",
    sip_trunk_auth_password: env.TWILIO_SIP_PASSWORD ?? "",
    transport: "TCP",
    inbound_agents: [{ agent_id: agentId, weight: 1 }],
  }).catch((e) => console.log(`      ⚠ retell import: ${e.message}`));

  console.log(`      ✓ routed to ${label} demo agent`);
  results.push({ label, phone, bought: true, routed: true });
}

// ---------- summary ----------
console.log("\n" + "─".repeat(52));
if (!results.length) {
  console.log("Nothing to do.");
} else if (!CONFIRM) {
  console.log("DRY RUN — nothing was purchased. Re-run with --confirm to buy:\n");
  for (const r of results) console.log(`  ${r.label.padEnd(16)} ${r.phone}`);
  console.log(`\n  node scripts/provision-demo-lines.mjs --area ${AREA || "<areacode>"} --confirm`);
} else {
  console.log("Demo lines ready — put these on your cards/postcards:\n");
  for (const r of results) console.log(`  ${r.label.padEnd(16)} ${r.phone}${r.routed === false ? "  (NOT routed)" : ""}`);
  console.log("\nCall one yourself first to confirm it answers before you hand it out.");
}
console.log("");
