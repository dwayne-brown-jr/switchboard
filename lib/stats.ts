import { prisma } from "./db";

// Dashboard stats computed from CallRecord. All owner-facing: outcomes, not tech.

export type Period = 7 | 30 | 90;

export interface DashboardStats {
  period: Period;
  callsAnswered: number;
  afterHours: number;
  jobsBooked: number;
  revenueBooked: number; // sum of estJobValue on booked calls
  hotJobs: number;
  recovered: number; // missed calls recovered
  messages: number; // messages taken for the owner
}

export async function getStats(shopId: string, period: Period): Promise<DashboardStats> {
  const since = new Date(Date.now() - period * 24 * 60 * 60 * 1000);
  const calls = await prisma.callRecord.findMany({
    where: { shopId, timestamp: { gte: since } },
    select: { afterHours: true, booked: true, estJobValue: true, hotJob: true, recovered: true, outcome: true },
  });

  return {
    period,
    callsAnswered: calls.length,
    afterHours: calls.filter((c) => c.afterHours).length,
    jobsBooked: calls.filter((c) => c.booked).length,
    revenueBooked: calls.filter((c) => c.booked).reduce((s, c) => s + (c.estJobValue || 0), 0),
    hotJobs: calls.filter((c) => c.hotJob).length,
    recovered: calls.filter((c) => c.recovered || c.outcome === "missed_recovered").length,
    messages: calls.filter((c) => c.outcome === "message").length,
  };
}

export async function getRecentCalls(shopId: string, take = 25) {
  return prisma.callRecord.findMany({
    where: { shopId },
    orderBy: { timestamp: "desc" },
    take,
  });
}

export function formatMoney(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

// --- Richer analytics for the owner dashboard -------------------------------

const DAY = 24 * 60 * 60 * 1000;

export interface Delta {
  pct: number | null; // null = "new" (no prior activity to compare against)
  dir: "up" | "down" | "flat";
}
export interface SeriesPoint {
  label: string;
  total: number;
  booked: number;
}
export interface OutcomeSlice {
  key: string;
  label: string;
  count: number;
}
export interface DashboardData {
  period: Period;
  current: DashboardStats;
  deltas: {
    callsAnswered: Delta;
    jobsBooked: Delta;
    revenueBooked: Delta;
    afterHours: Delta;
  };
  series: SeriesPoint[];
  outcomes: OutcomeSlice[];
  bookingRate: number; // booked / answered, 0..1
  avgDurationSec: number;
  totalCalls: number; // all-time, for the "since launch" line
}

type MiniCall = {
  timestamp: Date;
  afterHours: boolean;
  booked: boolean;
  estJobValue: number;
  hotJob: boolean;
  recovered: boolean;
  outcome: string | null;
  durationSec: number;
};

function summarize(calls: MiniCall[]) {
  return {
    callsAnswered: calls.length,
    afterHours: calls.filter((c) => c.afterHours).length,
    jobsBooked: calls.filter((c) => c.booked).length,
    revenueBooked: calls.filter((c) => c.booked).reduce((s, c) => s + (c.estJobValue || 0), 0),
    hotJobs: calls.filter((c) => c.hotJob).length,
    recovered: calls.filter((c) => c.recovered || c.outcome === "missed_recovered").length,
    messages: calls.filter((c) => c.outcome === "message").length,
  };
}

function delta(cur: number, prev: number): Delta {
  if (prev === 0) return { pct: cur > 0 ? null : 0, dir: cur > 0 ? "up" : "flat" };
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { pct, dir: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}

const OUTCOME_ORDER: { key: string; label: string }[] = [
  { key: "booked", label: "Booked" },
  { key: "message", label: "Message taken" },
  { key: "escalated", label: "Emergency" },
  { key: "missed_recovered", label: "Recovered" },
  { key: "no_action", label: "No action" },
];

export async function getDashboardData(shopId: string, period: Period): Promise<DashboardData> {
  const now = Date.now();
  const windowStart = new Date(now - period * DAY);
  const priorStart = new Date(now - 2 * period * DAY);

  const [rows, totalCalls] = await Promise.all([
    prisma.callRecord.findMany({
      where: { shopId, timestamp: { gte: priorStart } },
      select: { timestamp: true, afterHours: true, booked: true, estJobValue: true, hotJob: true, recovered: true, outcome: true, durationSec: true },
    }),
    prisma.callRecord.count({ where: { shopId } }),
  ]);

  const cur = rows.filter((r) => r.timestamp >= windowStart);
  const prev = rows.filter((r) => r.timestamp < windowStart);
  const c = summarize(cur);
  const p = summarize(prev);

  // Daily buckets (weekly once the window is long) across the current period.
  const daily = period <= 30;
  const bucketMs = (daily ? 1 : 7) * DAY;
  const bucketCount = daily ? period : Math.ceil(period / 7);
  const series: SeriesPoint[] = [];
  for (let b = bucketCount - 1; b >= 0; b--) {
    const end = now - b * bucketMs;
    const start = end - bucketMs;
    const inB = cur.filter((r) => r.timestamp.getTime() >= start && r.timestamp.getTime() < end);
    series.push({
      label: new Date(start).toLocaleDateString("en-US", daily ? { month: "numeric", day: "numeric" } : { month: "short", day: "numeric" }),
      total: inB.length,
      booked: inB.filter((r) => r.booked).length,
    });
  }

  const outcomes: OutcomeSlice[] = OUTCOME_ORDER.map((o) => ({ ...o, count: cur.filter((r) => (r.outcome ?? "no_action") === o.key).length }));
  const avgDurationSec = cur.length ? Math.round(cur.reduce((s, r) => s + (r.durationSec || 0), 0) / cur.length) : 0;

  return {
    period,
    current: { period, ...c },
    deltas: {
      callsAnswered: delta(c.callsAnswered, p.callsAnswered),
      jobsBooked: delta(c.jobsBooked, p.jobsBooked),
      revenueBooked: delta(c.revenueBooked, p.revenueBooked),
      afterHours: delta(c.afterHours, p.afterHours),
    },
    series,
    outcomes,
    bookingRate: c.callsAnswered ? c.jobsBooked / c.callsAnswered : 0,
    avgDurationSec,
    totalCalls,
  };
}
