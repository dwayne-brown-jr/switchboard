// One-off: create the recurring QStash schedules for the launch-gate crons.
// Idempotent — lists existing schedules and only creates the missing ones.
// Reads QSTASH_TOKEN + QSTASH_URL from .env; never prints the token.
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const token = env.QSTASH_TOKEN;
const base = env.QSTASH_URL || "https://qstash.upstash.io";
const PROD = process.env.PROD_URL || "https://getswitchboardhq.com";
if (!token) { console.error("QSTASH_TOKEN missing in .env"); process.exit(1); }

const DESIRED = [
  { cron: "0 14 * * 1", path: "/api/jobs/weekly-digest" },
  { cron: "*/30 * * * *", path: "/api/jobs/onboarding-sweep" },
  { cron: "0 3 * * *", path: "/api/jobs/reclaim-numbers" },
  { cron: "0 15 * * *", path: "/api/jobs/health-check" },
  { cron: "0 16 * * *", path: "/api/jobs/reminders" },
  { cron: "0 8 * * *", path: "/api/jobs/usage-sweep" },
];

const auth = { Authorization: `Bearer ${token}` };

console.log(`QStash base: ${base}`);
console.log(`Destination base: ${PROD}\n`);

// 1. Existing schedules → dedupe by destination.
const listRes = await fetch(`${base}/v2/schedules`, { headers: auth });
if (!listRes.ok) { console.error(`List failed: ${listRes.status} ${await listRes.text()}`); process.exit(1); }
const existing = await listRes.json();
const existingDest = new Set((existing || []).map((s) => s.destination));
console.log(`Existing schedules: ${existing?.length ?? 0}`);

// 2. Create the missing ones.
for (const { cron, path } of DESIRED) {
  const dest = `${PROD}${path}`;
  if (existingDest.has(dest)) { console.log(`  ✓ already scheduled  ${path}  (${cron})`); continue; }
  const res = await fetch(`${base}/v2/schedules/${dest}`, {
    method: "POST",
    headers: { ...auth, "Upstash-Cron": cron, "Content-Type": "application/json" },
    body: "{}",
  });
  const txt = await res.text();
  if (res.ok) {
    let id = txt; try { id = JSON.parse(txt).scheduleId ?? txt; } catch {}
    console.log(`  + created           ${path}  (${cron})  id=${id}`);
  } else {
    console.log(`  ✗ FAILED            ${path}  (${cron})  ${res.status} ${txt}`);
  }
}
console.log("\nDone.");
