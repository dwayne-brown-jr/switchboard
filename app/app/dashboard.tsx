import Link from "next/link";
import type { ReactNode } from "react";
import type { Shop, CallRecord } from "@prisma/client";
import { type DashboardData, type Delta, type SeriesPoint, type Period, formatMoney } from "@/lib/stats";
import { PauseSwitch } from "./pause-switch";
import { openBillingPortal } from "./subscribe/actions";

// Shared outcome vocabulary (owner-facing, semantic status colors — always
// paired with a text label so identity is never color-alone).
const OUTCOME: Record<string, { label: string; dot: string; bar: string; chip: string }> = {
  booked: { label: "Booked", dot: "bg-green-500", bar: "bg-green-500", chip: "bg-green-100 text-green-700" },
  message: { label: "Message", dot: "bg-brand-500", bar: "bg-brand-500", chip: "bg-brand-100 text-brand-700" },
  escalated: { label: "Emergency", dot: "bg-red-500", bar: "bg-red-500", chip: "bg-red-100 text-red-700" },
  missed_recovered: { label: "Recovered", dot: "bg-violet-500", bar: "bg-violet-500", chip: "bg-violet-100 text-violet-700" },
  no_action: { label: "No action", dot: "bg-slate-300", bar: "bg-slate-300", chip: "bg-slate-100 text-slate-500" },
};

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    {children}
  </svg>
);
const icons = {
  phone: svg(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />),
  calendar: svg(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4M16 2v4m-7 10 2 2 4-4" /></>),
  dollar: svg(<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />),
  moon: svg(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />),
};

function A2pChip({ status }: { status: string | null }) {
  const map: Record<string, { label: string; tone: string }> = {
    approved: { label: "Texting on", tone: "bg-green-100 text-green-700" },
    submitted: { label: "Texting: pending", tone: "bg-amber-100 text-amber-700" },
    failed: { label: "Texting: needs attention", tone: "bg-red-100 text-red-700" },
    not_started: { label: "Texting off", tone: "bg-slate-100 text-slate-500" },
  };
  const s = map[status ?? "not_started"] ?? map.not_started;
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.tone}`}>{s.label}</span>;
}

export function Dashboard({ shop, data, calls, period }: { shop: Shop; data: DashboardData; calls: CallRecord[]; period: Period }) {
  const paused = shop.status === "paused";
  const s = data.current;

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">{shop.businessName}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {paused ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">Paused</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                <span className="relative inline-flex h-2 w-2 text-green-500">
                  <span className="ping-ring absolute inline-flex h-2 w-2 rounded-full" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
                Live{shop.agentNumber ? ` · ${shop.agentNumber}` : ""}
              </span>
            )}
            <A2pChip status={shop.a2pStatus} />
            <span className="text-xs text-slate-400">{data.totalCalls.toLocaleString()} calls since launch</span>
          </div>
        </div>
        <PeriodPicker period={period} />
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={icons.phone} label="Calls answered" value={s.callsAnswered} delta={data.deltas.callsAnswered} sub={`${s.afterHours} after hours`} />
        <Kpi icon={icons.calendar} label="Jobs booked" value={s.jobsBooked} delta={data.deltas.jobsBooked} sub={`${s.messages} messages taken`} />
        <Kpi icon={icons.dollar} label="Revenue booked" value={formatMoney(s.revenueBooked)} delta={data.deltas.revenueBooked} sub="estimated" accent />
        <Kpi icon={icons.moon} label="Saved from voicemail" value={s.afterHours} delta={data.deltas.afterHours} sub={`after-hours · ${s.hotJobs} emergencies flagged`} />
      </div>

      {/* Analytics */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Call activity</h2>
            <Legend />
          </div>
          <div className="mt-5">
            <ActivityChart series={data.series} />
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-slate-900">How calls ended</h2>
          <div className="mt-4 flex items-center gap-5">
            <Ring pct={data.bookingRate} />
            <div className="min-w-0 flex-1 space-y-2.5">
              {data.outcomes.map((o) => {
                const meta = OUTCOME[o.key] ?? OUTCOME.no_action;
                const pct = s.callsAnswered ? Math.round((o.count / s.callsAnswered) * 100) : 0;
                return (
                  <div key={o.key}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-slate-600">
                        <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                      <span className="font-medium text-slate-800">{o.count}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <PauseSwitch shopId={shop.id} paused={paused} />

      {/* Recent calls */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="font-semibold text-slate-900">Recent calls</h2>
          <span className="text-xs text-slate-400">Avg call {formatDuration(data.avgDurationSec)}</span>
        </div>
        {calls.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">No calls yet. As soon as your receptionist takes calls, they&apos;ll show up here.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">When</th>
                  <th className="px-5 py-2.5 font-medium">Caller</th>
                  <th className="px-5 py-2.5 font-medium">About</th>
                  <th className="px-5 py-2.5 font-medium">Outcome</th>
                  <th className="px-5 py-2.5 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calls.map((c) => {
                  const chip = OUTCOME[c.outcome ?? "no_action"] ?? OUTCOME.no_action;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-5 py-3 text-slate-600">{fmtTime(c.timestamp)}</td>
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums text-slate-600">{c.callerPhone ?? "—"}</td>
                      <td className="px-5 py-3 text-slate-600">{c.intent ?? "—"}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chip.chip}`}>{chip.label}</span>
                        {c.hotJob && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">🚨</span>}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {c.booked && c.service ? (
                          <span>
                            {c.service}
                            {c.apptTime ? ` · ${fmtTime(new Date(c.apptTime))}` : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                        {c.transcriptUrl && (
                          <a href={c.transcriptUrl} target="_blank" rel="noreferrer" className="ml-2 text-brand-600 hover:underline">
                            recording
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-1 text-sm">
        <Link href="/app/settings" className="font-medium text-brand-600 hover:underline">
          Edit services, hours &amp; voice →
        </Link>
        {shop.stripeCustomerId && (
          <form action={openBillingPortal}>
            <button type="submit" className="font-medium text-slate-500 hover:text-slate-800 hover:underline">
              Manage billing &amp; plan
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// --- KPI tile ---------------------------------------------------------------
function Kpi({ icon, label, value, delta, sub, accent }: { icon: ReactNode; label: string; value: string | number; delta: Delta; sub?: string; accent?: boolean }) {
  return (
    <div className={`card p-5 ${accent ? "bg-gradient-to-br from-accent-50 to-white ring-1 ring-accent-100" : ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${accent ? "bg-accent-100 text-accent-600" : "bg-brand-50 text-brand-600"}`}>{icon}</span>
      </div>
      <p className="mt-2 font-display text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <DeltaChip d={delta} />
        {sub && <span className="text-xs text-slate-400">{sub}</span>}
      </div>
    </div>
  );
}

function DeltaChip({ d }: { d: Delta }) {
  if (d.pct === null) return <span className="rounded-md bg-green-50 px-1.5 py-0.5 text-[11px] font-semibold text-green-700">New</span>;
  if (d.dir === "flat") return <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">— 0%</span>;
  const up = d.dir === "up";
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${up ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
      {up ? "▲" : "▼"} {Math.abs(d.pct)}%
    </span>
  );
}

// --- Booking-rate ring ------------------------------------------------------
function Ring({ pct }: { pct: number }) {
  const r = 30;
  const C = 2 * Math.PI * r;
  const off = C * (1 - Math.min(1, Math.max(0, pct)));
  return (
    <div className="relative h-[84px] w-[84px] shrink-0">
      <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
        <circle cx="42" cy="42" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle cx="42" cy="42" r={r} fill="none" stroke="#16a34a" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-lg font-bold text-slate-900">{Math.round(pct * 100)}%</span>
        <span className="-mt-0.5 text-[10px] text-slate-400">booked</span>
      </div>
    </div>
  );
}

// --- Activity bar chart (server-rendered; CSS group-hover tooltip) ----------
function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs text-slate-500">
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-brand-600" /> Booked</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-slate-300" /> Other calls</span>
    </div>
  );
}

function ActivityChart({ series }: { series: SeriesPoint[] }) {
  const max = Math.max(1, ...series.map((s) => s.total));
  const H = 150;
  const step = Math.max(1, Math.ceil(series.length / 8));
  const hasData = series.some((s) => s.total > 0);

  if (!hasData) {
    return <div className="flex h-[150px] items-center justify-center text-sm text-slate-400">No calls in this period yet.</div>;
  }

  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: H }}>
        {series.map((s, i) => {
          const totalH = (s.total / max) * H;
          const bookedH = (s.booked / max) * H;
          const otherH = totalH - bookedH;
          return (
            <div key={i} className="group relative flex flex-1 flex-col justify-end" style={{ height: H }}>
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block">
                <div className="font-semibold">{s.label}</div>
                <div className="text-slate-300">{s.total} calls · {s.booked} booked</div>
              </div>
              {otherH > 0 && <div className="w-full rounded-t bg-slate-300 transition group-hover:bg-slate-400" style={{ height: Math.max(2, otherH) }} />}
              {bookedH > 0 && <div className={`w-full bg-brand-600 transition group-hover:bg-brand-700 ${otherH > 0 ? "mt-0.5 rounded-b" : "rounded"}`} style={{ height: Math.max(2, bookedH) }} />}
              {s.total === 0 && <div className="w-full rounded-full bg-slate-100" style={{ height: 3 }} />}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        {series.map((s, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-slate-400">{i % step === 0 ? s.label : ""}</div>
        ))}
      </div>
    </div>
  );
}

function PeriodPicker({ period }: { period: Period }) {
  const opts: Period[] = [7, 30, 90];
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm">
      {opts.map((p) => (
        <Link
          key={p}
          href={`/app?period=${p}`}
          className={`rounded-lg px-3 py-1.5 ${p === period ? "bg-brand-600 font-semibold text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          {p}d
        </Link>
      ))}
    </div>
  );
}

function fmtTime(d: Date): string {
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function formatDuration(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}
