// Call-ingest burst test — does a flood of simultaneous call-ended webhooks
// lose any records, and does a concurrent duplicate delivery break anything?
//
// This is the silent-failure path. If ingest drops writes, calls are still
// answered and nothing errors — the dashboard is just quietly wrong, revenue
// estimates are wrong, and usage billing is wrong. Nobody notices for weeks.
//
// SAFETY: recordCall fires the owner backstop (email + push + SMS) only on a
// genuinely-new call where booked or emergency is true (lib/ingest.ts:57). Every
// payload here deliberately omits both, so it maps to outcome "no_action" and
// sends nothing. Do not add booked/emergency to these payloads — that is what
// keeps a burst test from texting a real phone 50 times.
//
//   node scripts/stress-webhook-burst.mjs [count] [baseUrl]
//
// Local only. Cleans up the records it creates.

import crypto from "node:crypto";
import { stressPrisma } from "./_stress-db.mjs";

const COUNT = Number(process.argv[2] ?? 50);
const BASE = process.argv[3] ?? "http://localhost:3100";
const SHOP_ID = "demo_reviewer_shop";
const TAG = `stress_${Date.now()}`;

if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error(`refusing to run against ${BASE}`);


const secret = process.env.AUTH_SECRET || "dev-insecure-secret";
const token = crypto.createHmac("sha256", secret).update(`agent:${SHOP_ID}`).digest("hex").slice(0, 32);
const url = `${BASE}/api/agent/call-events?client_id=${SHOP_ID}&token=${token}`;
const { prisma, target } = stressPrisma();

const payloads = Array.from({ length: COUNT }, (_, i) => ({
  call_id: `${TAG}_${i}`,
  start_timestamp: Date.now() - i * 60_000,
  duration_ms: 120_000,
  from_number: "+17605550001",
  transcript: "Caller asked about opening hours.",
  // No booked / no emergency — keeps the owner backstop from firing.
  call_analysis: { call_summary: "Hours question.", custom_analysis_data: { intent: "hours" } },
}));

const post = (p) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
    .catch((e) => ({ status: 0, body: { error: e.message } }));

console.log(`\n  ${COUNT} concurrent call-ended webhooks → ${BASE}`);
console.log(`  database: ${target}\n`);

// --- phase 1: unique deliveries -------------------------------------------
const t0 = Date.now();
const first = await Promise.all(payloads.map(post));
const elapsed = Date.now() - t0;

const ok = first.filter((r) => r.status === 200 && r.body?.ok).length;
const failed = first.filter((r) => r.status !== 200).length;
const stored = await prisma.callRecord.count({ where: { callId: { startsWith: TAG } } });

console.log(`  phase 1 — unique deliveries`);
console.log(`    responses:  ${ok} ok, ${failed} non-200   (${elapsed}ms wall clock)`);
console.log(`    rows saved: ${stored} / ${COUNT}`);
if (stored < COUNT) {
  console.log(`    ❌ LOST ${COUNT - stored} record(s) — silent data loss.`);
  const sample = first.find((r) => r.status !== 200);
  if (sample) console.log(`       sample failure: ${JSON.stringify(sample).slice(0, 160)}`);
} else {
  console.log(`    ✅ every call recorded`);
}

// --- phase 2: concurrent duplicate delivery -------------------------------
// Retell retries on a 500, and a retry can overlap the original. Two upserts
// racing on the same callId must not create a duplicate or throw a 500 — a 500
// makes Retell retry again, which is how a retry storm starts.
console.log(`\n  phase 2 — same ${COUNT} call ids delivered again, concurrently`);
const second = await Promise.all(payloads.map(post));
const ok2 = second.filter((r) => r.status === 200).length;
const err2 = second.filter((r) => r.status >= 500).length;
const afterReplay = await prisma.callRecord.count({ where: { callId: { startsWith: TAG } } });

console.log(`    responses:  ${ok2} ok, ${err2} server errors`);
console.log(`    rows now:   ${afterReplay} (should still be ${stored})`);
if (afterReplay !== stored) console.log(`    ❌ replay changed the row count — ingest is not idempotent.`);
else if (err2 > 0) console.log(`    ⚠️  idempotent, but ${err2} replays returned 5xx — Retell would retry these.`);
else console.log(`    ✅ idempotent under concurrent replay`);

// --- cleanup ---------------------------------------------------------------
const { count } = await prisma.callRecord.deleteMany({ where: { callId: { startsWith: TAG } } });
console.log(`\n  cleaned up ${count} test record(s)\n`);
await prisma.$disconnect();
