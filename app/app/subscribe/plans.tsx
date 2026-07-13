"use client";

import { useState, useTransition } from "react";
import { PLANS } from "@/lib/plans";
import { startCheckout, simulateSubscription } from "./actions";

export function PlanPicker({ stripeConfigured }: { stripeConfigured: boolean }) {
  const [pending, start] = useTransition();
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState("");

  function choose(planId: string) {
    setError("");
    setBusyPlan(planId);
    start(async () => {
      try {
        if (stripeConfigured) await startCheckout(planId);
        else await simulateSubscription(planId);
      } catch (e) {
        // redirect() throws internally; only surface real errors.
        const msg = (e as Error).message;
        if (!msg?.includes("NEXT_REDIRECT")) setError(msg);
        setBusyPlan(null);
      }
    });
  }

  const single = PLANS.length === 1;

  return (
    <div>
      <div className={single ? "mx-auto max-w-sm" : "grid gap-5 md:grid-cols-3"}>
        {PLANS.map((p) => (
          <div
            key={p.id}
            className={`card relative flex flex-col p-6 ${p.popular ? "ring-2 ring-brand-500" : ""}`}
          >
            {p.popular && !single && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
                Most popular
              </span>
            )}
            <h3 className="text-lg font-semibold text-slate-900">{p.name}</h3>
            <p className="text-sm text-slate-500">{p.tagline}</p>
            <div className="mt-4">
              <span className="text-3xl font-bold text-slate-900">${p.price}</span>
              <span className="text-slate-500">/mo</span>
            </div>
            <ul className="mt-5 flex-1 space-y-2">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                  <span className="text-green-600">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              className={`mt-6 ${p.popular ? "btn-primary" : "btn-secondary"}`}
              disabled={pending}
              onClick={() => choose(p.id)}
            >
              {busyPlan === p.id ? "Starting…" : single ? "Get started" : `Choose ${p.name}`}
            </button>
          </div>
        ))}
      </div>
      {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
      {!stripeConfigured && (
        <p className="mt-6 text-center text-xs text-amber-600">
          Dev mode: billing keys aren&apos;t set, so choosing a plan simulates a subscription so you can test the rest of setup.
        </p>
      )}
    </div>
  );
}
