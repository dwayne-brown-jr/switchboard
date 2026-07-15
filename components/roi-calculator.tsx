"use client";

import { useState } from "react";
import { VERTICAL_DEFS, VERTICALS } from "@/lib/verticals";

// Missed-call ROI calculator. Conservative, sourced math — the whole local
// pitch in one widget. Deliberately uses defensible numbers (62% of small-biz
// calls go unanswered — 411 Locals; per-vertical average tickets from
// lib/verticals) so a skeptical owner can't smell inflation.

const WORKDAYS = 25; // billable days per month
const PRICE = 149;

function money(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function RoiCalculator() {
  const [vertical, setVertical] = useState<string>("auto");
  const [missed, setMissed] = useState(2);
  const [bookPct, setBookPct] = useState(30);
  const [ticket, setTicket] = useState(VERTICAL_DEFS.auto.avgTicket);

  const monthly = missed * (bookPct / 100) * ticket * WORKDAYS;
  const roi = monthly / PRICE;

  function pickVertical(v: string) {
    setVertical(v);
    setTicket(VERTICAL_DEFS[v as keyof typeof VERTICAL_DEFS].avgTicket);
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-accent-500/5 sm:p-8">
      <div className="grid gap-8 sm:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your trade</label>
            <select
              value={vertical}
              onChange={(e) => pickVertical(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-900 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-200"
            >
              {VERTICALS.map((v) => (
                <option key={v} value={v}>
                  {VERTICAL_DEFS[v].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Calls you miss a day</label>
              <span className="font-display text-lg font-bold text-slate-900">{missed}</span>
            </div>
            <input type="range" min={1} max={15} value={missed} onChange={(e) => setMissed(Number(e.target.value))} className="mt-2 w-full accent-accent-500" />
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Of those, % that would book</label>
              <span className="font-display text-lg font-bold text-slate-900">{bookPct}%</span>
            </div>
            <input type="range" min={10} max={60} step={5} value={bookPct} onChange={(e) => setBookPct(Number(e.target.value))} className="mt-2 w-full accent-accent-500" />
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Average job value</label>
              <span className="font-display text-lg font-bold text-slate-900">{money(ticket)}</span>
            </div>
            <input type="range" min={75} max={2000} step={25} value={ticket} onChange={(e) => setTicket(Number(e.target.value))} className="mt-2 w-full accent-accent-500" />
          </div>
        </div>

        {/* Result */}
        <div className="flex flex-col justify-center rounded-2xl bg-slate-900 p-6 text-center">
          <p className="text-sm text-slate-300">Revenue walking out the door</p>
          <p className="mt-1 font-display text-4xl font-extrabold text-white sm:text-5xl">
            {money(monthly)}
            <span className="text-lg font-normal text-slate-400">/mo</span>
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            That&apos;s about <span className="font-bold text-accent-300">{roi >= 1 ? `${Math.round(roi)}×` : "a fraction of"}</span> the{" "}
            {money(PRICE)}/mo Switchboard costs — captured instead of missed.
          </p>
          <a href="/login" className="btn-accent mt-5 w-full justify-center">Stop missing them →</a>
        </div>
      </div>
      <p className="mt-5 text-center text-xs text-slate-400">
        Conservative estimate: ~62% of calls to small businesses go unanswered (411 Locals). Assumes {WORKDAYS} working days. Adjust to your reality.
      </p>
    </div>
  );
}
