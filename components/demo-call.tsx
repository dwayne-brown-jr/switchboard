"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_TYPES, demoType, resolveVars, type DemoTypeId, type Line } from "@/lib/demo";

type Phase = "idle" | "connecting" | "live" | "error";

export function DemoCall({ realCallEnabled }: { realCallEnabled: boolean }) {
  const [type, setType] = useState<DemoTypeId>("auto");
  const [phase, setPhase] = useState<Phase>("idle");
  const [form, setForm] = useState({ business: "", city: "", service: "" });
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState("");
  const clientRef = useRef<{ stopCall: () => void } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const def = demoType(type);

  // Stop any live call on unmount.
  useEffect(() => {
    return () => clientRef.current?.stopCall();
  }, []);

  // Auto-scroll the transcript as it grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  function selectType(id: DemoTypeId) {
    clientRef.current?.stopCall();
    clientRef.current = null;
    setType(id);
    setForm({ business: "", city: "", service: "" });
    setLines([]);
    setError("");
    setPhase("idle");
  }

  async function startCall() {
    clientRef.current?.stopCall();
    setLines([]);
    setError("");
    setPhase("connecting");
    const vars = resolveVars(type, form);
    try {
      const res = await fetch("/api/demo/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...vars }),
      });
      const data = (await res.json().catch(() => ({}))) as { accessToken?: string; error?: string };
      if (!res.ok || !data.accessToken) {
        setError(data.error || "Couldn't start the call.");
        setPhase("error");
        return;
      }
      const { RetellWebClient } = await import("retell-client-js-sdk");
      const client = new RetellWebClient();
      clientRef.current = client;
      client.on("call_started", () => setPhase("live"));
      client.on("call_ended", () => {
        setPhase("idle");
        clientRef.current = null;
      });
      client.on("update", (u: { transcript?: { role: string; content: string }[] }) => {
        if (!u?.transcript) return;
        setLines(u.transcript.map((t) => ({ who: t.role === "agent" ? "agent" : "caller", text: t.content })));
      });
      client.on("error", (e: unknown) => {
        setError(String((e as { message?: string })?.message ?? e));
        setPhase("error");
        try {
          client.stopCall();
        } catch {}
      });
      await client.startCall({ accessToken: data.accessToken });
    } catch (e) {
      setError((e as Error).message || "Could not start the call. Check microphone permission.");
      setPhase("error");
    }
  }

  function endCall() {
    clientRef.current?.stopCall();
    clientRef.current = null;
    setPhase("idle");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: controls */}
      <div>
        <span className="label">1. Pick a business type</span>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {DEMO_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectType(t.id)}
              className={`rounded-xl border p-3 text-left text-sm transition ${
                type === t.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <span className="font-semibold text-slate-900">{t.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{def.blurb}</p>

        <div className="mt-5 space-y-3">
          <span className="label">2. Make it yours (optional)</span>
          <input
            className="input"
            value={form.business}
            onChange={(e) => setForm({ ...form, business: e.target.value })}
            placeholder={`Business name — e.g. ${def.defaults.business}`}
          />
          <input
            className="input"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            placeholder={`City — e.g. ${def.defaults.city}`}
          />
          <input
            className="input"
            value={form.service}
            onChange={(e) => setForm({ ...form, service: e.target.value })}
            placeholder={`${def.serviceLabel} — e.g. ${def.defaults.service}`}
          />

          <div className="pt-1">
            {!realCallEnabled ? (
              <p className="text-sm text-slate-500">The live demo is warming up — check back shortly.</p>
            ) : phase === "live" ? (
              <button type="button" onClick={endCall} className="btn bg-red-500 text-white hover:bg-red-600">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> End call
              </button>
            ) : (
              <button type="button" onClick={startCall} disabled={phase === "connecting"} className="btn-primary px-5 py-3 text-base">
                🎙️ {phase === "connecting" ? "Connecting…" : "Start the demo call"}
              </button>
            )}
          </div>
          {realCallEnabled && <p className="text-xs text-slate-400">Talk to a live AI voice right in your browser — it uses your mic, no phone needed.</p>}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>

      {/* Right: phone transcript */}
      <div className="rounded-2xl bg-slate-900 p-5 text-white shadow-lg">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className={`h-2.5 w-2.5 rounded-full ${phase === "live" ? "animate-pulse bg-green-400" : "bg-slate-500"}`} />
            {phase === "live" ? "Live call" : phase === "connecting" ? "Connecting…" : "Demo call"}
          </div>
          <span className="text-xs text-slate-400">{resolveVars(type, form).business}</span>
        </div>

        <div ref={scrollRef} className="mt-4 flex h-72 flex-col gap-3 overflow-y-auto pr-1">
          {lines.length === 0 && (
            <div className="m-auto max-w-[16rem] text-center text-sm text-slate-400">
              {phase === "connecting"
                ? "Connecting your call…"
                : "Press “Start the demo call” and say, for example, “I’d like to book an appointment.” The live transcript shows here."}
            </div>
          )}
          {lines.map((l, i) => (
            <div key={i} className={`flex ${l.who === "agent" ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-snug ${
                  l.who === "agent" ? "bg-brand-600 text-white" : "bg-white/10 text-slate-100"
                }`}
              >
                <div className="mb-0.5 text-[10px] uppercase tracking-wide opacity-60">{l.who === "agent" ? "Receptionist" : "You"}</div>
                {l.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
