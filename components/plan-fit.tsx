"use client";

import { useState } from "react";
import { TIERS } from "@/lib/plans";

// "How busy are you?" → which plan you land on.
//
// The included-minutes model is the single most confusing thing on the pricing
// page ("what happens if I get busy?"), and burying it in a bullet invites the
// objection instead of answering it. This turns it into one slider the visitor
// drives themselves — the same move Checkly makes with usage sliders inside the
// plan card. Numbers come from lib/plans TIERS so this can never drift from
// what actually gets billed.

const AVG_CALL_MIN = 3; // typical answered call
const WORKDAYS = 26;

function money(n: number) {
  return "$" + n.toLocaleString("en-US");
}

export function PlanFit() {
  const [callsPerDay, setCallsPerDay] = useState(5);

  const minutes = Math.round(callsPerDay * AVG_CALL_MIN * WORKDAYS);
  // TIERS is ordered by included minutes; find the first that covers this usage.
  const fit = TIERS.find((t) => minutes <= t.includedMinutes);
  const top = TIERS[TIERS.length - 1];
  const base = TIERS[0];

  return (
    // h-full so this matches the height of the plan card it sits beside, rather
    // than each column sizing to its own content. Flex column + mt-auto on the
    // footnote keeps that note pinned to the bottom instead of leaving a gap
    // under it — and it stops the card resizing as the slider moves between
    // verdicts of different lengths.
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor="callsPerDay" className="text-sm font-semibold text-slate-900">
          How many calls do you get a day?
        </label>
        <span className="font-display text-2xl font-extrabold tabular-nums text-slate-900">{callsPerDay}</span>
      </div>

      <input
        id="callsPerDay"
        type="range"
        min={1}
        max={25}
        step={1}
        value={callsPerDay}
        onChange={(e) => setCallsPerDay(Number(e.target.value))}
        className="mt-3 w-full accent-accent-500"
      />
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>1</span>
        <span>25+</span>
      </div>

      <p className="mt-4 text-sm text-slate-500">
        That&apos;s roughly <span className="font-semibold tabular-nums text-slate-700">{minutes.toLocaleString()} talk-minutes</span> a
        month, at a typical {AVG_CALL_MIN}-minute call.
      </p>

      {/* Every branch starts from the one purchasable plan. There is exactly one
          plan to buy ({base.price}); higher tiers are automatic upgrades, never a
          checkout choice — so the copy must never imply a plan you can select. */}
      <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        {fit && fit.id === base.id ? (
          <>
            <p className="text-[15px] font-semibold text-slate-900">
              Comfortably inside the {money(base.price)} plan.
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {base.includedMinutes.toLocaleString()} minutes are included — no overage, no per-call fees.
            </p>
          </>
        ) : fit ? (
          <>
            <p className="text-[15px] font-semibold text-slate-900">
              You&apos;d still start at {money(base.price)}{" "}
              — then we&apos;d move you up.
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              That&apos;s past the {base.includedMinutes.toLocaleString()}{" "}
              minutes included, so we&apos;d shift you to our higher tier ({money(fit.price)}/mo,{" "}
              {fit.includedMinutes.toLocaleString()}{" "}
              minutes) — and tell you before we do. Nothing extra to pick, and never a surprise bill.
            </p>
          </>
        ) : (
          <>
            <p className="text-[15px] font-semibold text-slate-900">
              You&apos;d still start at {money(base.price)}{" "}
              — then we&apos;d talk.
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Above {top.includedMinutes.toLocaleString()}{" "}
              minutes we price it with you directly, rather than letting a bill surprise you.
            </p>
          </>
        )}
      </div>

      <p className="mt-auto pt-3 text-center text-xs text-slate-400">
        There&apos;s only one plan to choose. Busier months are handled for you.
      </p>
    </div>
  );
}
