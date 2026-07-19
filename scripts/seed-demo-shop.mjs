// Seed (or refresh) the reviewer demo shop: a live-looking shop owned by
// DEMO_LOGIN_EMAIL, full of generated calls, so /demo lands on a populated
// dashboard instead of the onboarding wizard.
//
//   DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/seed-demo-shop.mjs
//   (omit both to seed the local prisma/dev.db)
//
// Idempotent: fixed ids, upserts throughout, and calls are cleared and
// regenerated each run.
//
// SAFETY: all external ids are deliberately mock-shaped —
//   twilioNumberSid "PNmock…", agentId "agent_demo…", stripeCustomerId "cus_demo…"
// so pause/cancel/billing actions performed by a curious reviewer degrade to
// no-ops or clean errors instead of releasing a real number, deleting a real
// Retell agent, or touching real Stripe.
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import path from "node:path";
import { readFileSync } from "node:fs";

// --- env (mirrors lib/db.ts URL resolution) ---------------------------------
function loadEnv() {
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      if (!line.includes("=") || line.trim().startsWith("#")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
loadEnv();

function resolveUrl(raw) {
  const url = raw ?? "file:./dev.db";
  if (!url.startsWith("file:")) return url;
  const rel = url.slice("file:".length);
  return path.isAbsolute(rel) ? `file:${rel}` : `file:${path.join(process.cwd(), "prisma", rel)}`;
}

const url = resolveUrl(process.env.DATABASE_URL);
const authToken = process.env.TURSO_AUTH_TOKEN;
const EMAIL = (process.env.DEMO_LOGIN_EMAIL || "").trim();
if (!EMAIL) {
  console.error("DEMO_LOGIN_EMAIL is not set — set it first (same value as in Vercel).");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken }) });

// --- fixed ids so re-running never creates duplicates -----------------------
const SHOP_ID = "demo_reviewer_shop";
const USER_ID = "demo_reviewer_user";
const RUN_ID = "demo_reviewer_run";

const SERVICES = [
  { service: "Oil change", priceRange: "$45–$90", bookable: true },
  { service: "Brake service", priceRange: "", bookable: true },
  { service: "Check-engine / diagnostics", priceRange: "", bookable: true },
  { service: "A/C service", priceRange: "", bookable: true },
  { service: "Tire rotation", priceRange: "$25–$50", bookable: true },
];
const VALUES = { "Oil change": 70, "Brake service": 450, "Check-engine / diagnostics": 130, "A/C service": 350, "Tire rotation": 40 };
const HOURS = {
  mon: { open: "08:00", close: "17:00", closed: false }, tue: { open: "08:00", close: "17:00", closed: false },
  wed: { open: "08:00", close: "17:00", closed: false }, thu: { open: "08:00", close: "17:00", closed: false },
  fri: { open: "08:00", close: "17:00", closed: false }, sat: { open: "09:00", close: "13:00", closed: false },
  sun: { open: "", close: "", closed: true },
};

const CONFIG = {
  client_id: SHOP_ID,
  business_name: "Vista Auto Works (demo)",
  vertical: "auto",
  city: "Vista",
  service_area: "North County San Diego",
  hours: HOURS,
  services: SERVICES,
  price_ranges: { "Oil change": "$45–$90", "Tire rotation": "$25–$50" },
  booking_fields: ["customer_name", "phone", "vehicle_year", "vehicle_make", "vehicle_model", "service_needed", "preferred_time"],
  faqs: [
    { q: "Do you take walk-ins?", a: "Yes, though scheduled appointments are seen first." },
    { q: "Is there a diagnostic fee?", a: "Yes, and it's applied toward the repair if you proceed." },
  ],
  hot_job_rules: ["Vehicle won't start / dead in a driveway", "Driver stranded on the roadside", "Vehicle needs a tow", "Fleet vehicle down (business customer)"],
  escalation: { alert_number: "+17605550101" },
  avg_ticket: 420,
  service_value_map: VALUES,
  calendar_id: null,
  owner_phone: "+17605550101",
  business_number: "+17605550100",
  agent_number: "+17605550188",
  voice: "11labs-Marissa",
  greeting: "Thanks for calling Vista Auto Works — how can I help?",
  missing: [],
};

const PROMPT = `ROLE
You are the friendly phone receptionist for Vista Auto Works, an auto repair shop in Vista.

DISCLOSURE
At the very start of the call, briefly let the caller know the call may be recorded, and that you're an automated assistant if asked.

WHAT YOU KNOW
Services, hours, and prices as configured by the shop.

RULES
- Never quote an exact repair price; share ranges only.
- Never diagnose for certain over the phone.
- Collect vehicle year, make, and model for every booking.

BOOKING FLOW
Ask what's wrong, collect vehicle + contact details, offer real openings, confirm.

ESCALATION
Stranded, no-start, tow, or fleet-down calls are urgent: reassure, take details, alert the team.

HANDING OFF TO A PERSON
Handle the call yourself when you can; reach a human for emergencies or explicit requests.

CLOSING
Confirm next steps and thank them.`;

const STEPS = [
  "account", "wizard", "generate_config", "generate_prompt", "qa_review", "provision_voice", "subscribe",
  "provision_calendar", "provision_number", "register_pipeline", "test_agent", "forwarding", "go_live", "a2p",
];
const USER_STEPS = new Set(["account", "wizard", "subscribe", "test_agent", "forwarding", "a2p"]);

// --- generated calls ---------------------------------------------------------
const INTENTS = ["booking", "price question", "hours", "existing appointment", "emergency", "general question"];
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const ri = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const phone = () => `+1760${ri(200, 999)}${ri(1000, 9999)}`;

function makeCalls(n) {
  const rows = [];
  const bookable = SERVICES.filter((s) => s.bookable).map((s) => s.service);
  for (let i = 0; i < n; i++) {
    const daysAgo = Math.floor((i / n) * 28);
    const ts = new Date(Date.now() - daysAgo * 86400000 - ri(0, 12) * 3600000);
    const hour = ts.getHours();
    const afterHours = hour < 8 || hour >= 17;
    const roll = Math.random();
    const booked = roll < 0.42;
    const hot = !booked && roll < 0.52;
    const svc = booked ? rand(bookable) : null;
    rows.push({
      callId: `demo_${SHOP_ID}_${i}_${ts.getTime()}`,
      shopId: SHOP_ID,
      timestamp: ts,
      afterHours,
      durationSec: ri(45, 240),
      callerPhone: phone(),
      intent: booked ? "booking" : rand(INTENTS),
      outcome: booked ? "booked" : hot ? "escalated" : roll < 0.72 ? "message" : "no_action",
      booked,
      service: svc,
      apptTime: booked ? new Date(ts.getTime() + ri(1, 6) * 86400000).toISOString() : null,
      estJobValue: booked ? (VALUES[svc] ?? 0) : 0,
      hotJob: hot,
      recovered: !booked && Math.random() < 0.15,
      summary: booked
        ? `Caller booked ${svc?.toLowerCase()}. Vehicle details captured and appointment confirmed.`
        : hot
          ? "Caller reported an urgent problem and asked for a callback as soon as possible."
          : "Caller asked about services and hours; details taken for follow-up.",
      transcript: null,
      handledAt: null,
    });
  }
  return rows;
}

// --- run ---------------------------------------------------------------------
(async () => {
  console.log(`\nSeeding reviewer demo shop`);
  console.log(`  target: ${url.startsWith("file:") ? "LOCAL " + url : "REMOTE (Turso)"}`);
  console.log(`  owner:  ${EMAIL}\n`);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { id: USER_ID, email: EMAIL, name: "Demo Reviewer", emailVerified: true },
  });
  console.log(`  ✓ user ${user.id}`);

  const shopData = {
    ownerId: user.id,
    businessName: "Vista Auto Works (demo)",
    vertical: "auto",
    city: "Vista",
    timezone: "America/Los_Angeles",
    businessNumber: "+17605550100",
    ownerMobile: "+17605550101",
    status: "live",
    plan: "front_desk",
    subStatus: "active",
    stripeCustomerId: "cus_demo_reviewer",
    agentProvider: "retell",
    agentId: "agent_demo_reviewer",
    agentNumber: "+17605550188",
    twilioNumberSid: "PNmockdemoreviewer",
    a2pStatus: "not_started",
    digestOptOut: true, // never email the demo account
  };
  await prisma.shop.upsert({ where: { id: SHOP_ID }, update: shopData, create: { id: SHOP_ID, ...shopData } });
  console.log(`  ✓ shop ${SHOP_ID} (live, mock external ids)`);

  await prisma.agentVersion.deleteMany({ where: { shopId: SHOP_ID } });
  const version = await prisma.agentVersion.create({
    data: { shopId: SHOP_ID, config: CONFIG, systemPrompt: PROMPT, qaVerdict: "go", qaFlags: [], status: "live" },
  });
  await prisma.shop.update({ where: { id: SHOP_ID }, data: { liveVersionId: version.id } });
  console.log(`  ✓ live agent version`);

  await prisma.provisioningStep.deleteMany({ where: { runId: RUN_ID } });
  await prisma.onboardingRun.upsert({
    where: { shopId: SHOP_ID },
    update: { status: "live", currentStep: null, completedAt: new Date() },
    create: { id: RUN_ID, shopId: SHOP_ID, status: "live", completedAt: new Date() },
  });
  const run = await prisma.onboardingRun.findUnique({ where: { shopId: SHOP_ID } });
  for (const key of STEPS) {
    await prisma.provisioningStep.create({
      data: { runId: run.id, key, type: USER_STEPS.has(key) ? "user" : "auto", status: key === "a2p" ? "skipped" : "done" },
    });
  }
  console.log(`  ✓ onboarding run complete (${STEPS.length} steps)`);

  await prisma.callRecord.deleteMany({ where: { shopId: SHOP_ID } });
  const calls = makeCalls(46);
  for (const c of calls) await prisma.callRecord.create({ data: c });
  const booked = calls.filter((c) => c.booked);
  console.log(`  ✓ ${calls.length} calls (${booked.length} booked, ${calls.filter((c) => c.hotJob).length} urgent)`);
  console.log(`\nDone. Sign in at /demo with the configured code.\n`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("\nSeed failed:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
