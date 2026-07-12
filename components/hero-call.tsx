"use client";

import { useEffect, useState } from "react";

const script = [
  { who: "agent", text: "Thanks for calling Riverside Auto — how can I help?" },
  { who: "caller", text: "Can you fit me in for a brake job Tuesday?" },
  { who: "agent", text: "You're booked — Tuesday at 9:00 AM. See you then!" },
];

// A decorative, looping "answered call" card for the hero. Cycles through a
// short exchange, lands on a booked chip, pauses, restarts. Purely ornamental.
export function HeroCall() {
  const [step, setStep] = useState(0); // 0..3 bubbles, 4 = booked chip shown

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setStep(4);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;
    function run() {
      [900, 2100, 3500, 4900].forEach((t, i) => timers.push(setTimeout(() => !cancelled && setStep(i + 1), t)));
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setStep(0);
          run();
        }, 8000),
      );
    }
    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  const shown = script.slice(0, Math.min(step, 3));

  return (
    <div className="float relative">
      {/* soft glow */}
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-accent-500/20 via-brand-500/10 to-brand-600/20 blur-2xl" />
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 p-5 text-white shadow-2xl">
        {/* header */}
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 text-lg font-bold shadow-lg shadow-accent-500/30">
            S
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold">Switchboard receptionist</div>
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <span className="relative inline-flex h-2 w-2 text-green-400">
                <span className="ping-ring absolute inline-flex h-2 w-2 rounded-full" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
              </span>
              Live · answering
            </div>
          </div>
          {/* equalizer */}
          <div className="flex items-end gap-0.5" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="eq-bar h-4 w-1 rounded-full bg-accent-400/90"
                style={{ animationDelay: `${i * 0.15}s`, animationDuration: `${0.8 + i * 0.1}s` }}
              />
            ))}
          </div>
        </div>

        {/* transcript */}
        <div className="mt-4 flex min-h-[9.5rem] flex-col gap-2.5">
          {shown.map((l, i) => (
            <div key={i} className={`flex ${l.who === "agent" ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug transition ${
                  l.who === "agent" ? "bg-brand-600 text-white" : "bg-white/10 text-slate-100"
                }`}
              >
                {l.text}
              </div>
            </div>
          ))}
          {step >= 4 && (
            <div className="mt-1 inline-flex items-center gap-2 self-start rounded-full bg-accent-500/15 px-3 py-1.5 text-xs font-semibold text-accent-300 ring-1 ring-accent-500/30">
              <span>✓</span> Appointment booked · texted to owner
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
