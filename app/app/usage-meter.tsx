import { usageMeter } from "@/lib/usage-meter";
import type { UsageStatus } from "@/lib/usage";

// The owner's minutes meter.
//
// Shown always, not only when close to the limit. A meter at 20% is reassuring
// and teaches the model before it matters; one that only appears when something
// is wrong reads as an alarm the owner didn't know was armed.
//
// Numbers come from usageStatus(), the same function the billing sweep uses, so
// what an owner sees here is precisely what decides their plan.

const TONE = {
  ok: {
    bar: "bg-brand-500",
    track: "bg-slate-100",
    chip: "text-slate-500",
  },
  approaching: {
    bar: "bg-accent-500",
    track: "bg-accent-100",
    chip: "text-accent-700",
  },
  over: {
    bar: "bg-accent-600",
    track: "bg-accent-100",
    chip: "text-accent-700",
  },
} as const;

export function UsageMeter({ usage }: { usage: UsageStatus }) {
  const m = usageMeter(usage.used, usage.included);
  const tone = TONE[m.tone];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-slate-900">Talk-minutes this month</h2>
        <p className={`text-sm tabular-nums ${tone.chip}`}>
          <span className="font-semibold">{m.used.toLocaleString()}</span>
          {" of "}
          {m.included.toLocaleString()}
        </p>
      </div>

      <div className={`mt-2.5 h-2 w-full overflow-hidden rounded-full ${tone.track}`}>
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${tone.bar}`}
          style={{ width: `${m.pct}%` }}
        />
      </div>

      {/* One line, and it changes with the situation — a static caption would be
          noise at 20% and useless at 95%. */}
      <p className="mt-2 text-xs leading-5 text-slate-500">
        {m.tone === "over" ? (
          <>
            You&apos;re past the {m.included.toLocaleString()} minutes included on this plan.
            {usage.next ? (
              <>
                {" "}
                We&apos;ll move you to {usage.next.name} (${usage.next.price}/mo,{" "}
                {usage.next.includedMinutes.toLocaleString()} minutes) and tell you before it happens — nothing
                to pick, and no overage fees.
              </>
            ) : (
              <> We&apos;ll get in touch to price your volume directly rather than let a bill surprise you.</>
            )}
          </>
        ) : m.tone === "approaching" ? (
          <>
            {/* Explicit {" "} — the space after an interpolated value is not
                reliably preserved here, and it silently rendered "98minutes".
                Do not "tidy" these away. */}
            {m.remaining.toLocaleString()}{" "}
            minutes left this cycle. If you go over we move you up a tier and tell you first — you&apos;ll
            never get an overage charge.
          </>
        ) : (
          <>
            {m.remaining.toLocaleString()}{" "}
            minutes left in the last 30 days. No overage fees, and no per-call charges.
          </>
        )}
      </p>
    </section>
  );
}
