// Agent-tool latency under concurrency.
//
// This endpoint is unlike the rest of the app: check_availability runs *during*
// a phone call, while a human waits. A slow web page is an annoyance; a slow
// tool call is silence on the line, and callers hang up on silence. That makes
// p95 the number that matters, not the average.
//
// Rough bar: p95 under ~1500ms. Retell speaks a filler line while a tool runs
// ("let me check that for you"), which buys roughly a second before the pause
// reads as a dropped call.
//
//   node scripts/stress-agent-latency.mjs [concurrency] [rounds] [baseUrl]
//
// Read-only: check-availability writes nothing and notifies nobody.

import crypto from "node:crypto";
import { loadEnv } from "./_stress-db.mjs";

const CONCURRENCY = Number(process.argv[2] ?? 10);
const ROUNDS = Number(process.argv[3] ?? 3);
const BASE = process.argv[4] ?? "http://localhost:3100";
const SHOP_ID = "demo_reviewer_shop";

if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error(`refusing to run against ${BASE}`);

loadEnv();

const secret = process.env.AUTH_SECRET || "dev-insecure-secret";
const token = crypto.createHmac("sha256", secret).update(`agent:${SHOP_ID}`).digest("hex").slice(0, 32);
const url = `${BASE}/api/agent/check-availability?client_id=${SHOP_ID}&token=${token}`;

async function once() {
  const t = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args: { service: "Oil change" } }),
    });
    await r.json().catch(() => ({}));
    return { ms: Date.now() - t, status: r.status };
  } catch (e) {
    return { ms: Date.now() - t, status: 0, error: e.message };
  }
}

// Warm the route first: the very first hit in dev compiles it, and that number
// would swamp the percentiles without describing anything real.
await once();

const samples = [];
for (let r = 0; r < ROUNDS; r++) {
  samples.push(...(await Promise.all(Array.from({ length: CONCURRENCY }, once))));
}

const times = samples.map((s) => s.ms).sort((a, b) => a - b);
const pct = (p) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))];
const nonOk = samples.filter((s) => s.status !== 200);
// The route answers 200 with a "try again shortly" body when throttled, so a
// throttle would show up as fast responses rather than errors — worth knowing
// before reading these numbers as pure latency.
console.log(`\n  check-availability · ${CONCURRENCY} concurrent × ${ROUNDS} rounds = ${samples.length} calls\n`);
console.log(`    p50   ${pct(50)}ms`);
console.log(`    p95   ${pct(95)}ms`);
console.log(`    max   ${times[times.length - 1]}ms`);
console.log(`    non-200: ${nonOk.length}`);

const p95 = pct(95);
console.log("");
if (p95 < 1500) console.log(`  ✅ p95 ${p95}ms — comfortably inside the mid-call budget`);
else if (p95 < 3000) console.log(`  ⚠️  p95 ${p95}ms — callers would notice the pause`);
else console.log(`  ❌ p95 ${p95}ms — long enough that callers hang up`);
console.log("");
