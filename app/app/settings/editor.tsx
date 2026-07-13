"use client";

import { useState, useTransition, useRef } from "react";
import type { WizardData } from "@/lib/schemas";
import type { QaFlag } from "@/lib/schemas";
import { VERTICAL_DEFS, DAY_LABELS, VOICES, type Vertical } from "@/lib/verticals";
import { saveSettings, publishSettings } from "./actions";

type Result =
  | { kind: "idle" }
  | { kind: "missing"; missing: string[] }
  | { kind: "qa"; versionId: string; verdict: "go" | "no_go"; flags: QaFlag[] }
  | { kind: "published" }
  | { kind: "error"; message: string };

export function SettingsEditor({ initial }: { initial: WizardData }) {
  const [data, setData] = useState<WizardData>(initial);
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const [pending, start] = useTransition();
  const [dirty, setDirty] = useState(false);
  const update = (patch: Partial<WizardData>) => {
    setData((d) => ({ ...d, ...patch }));
    setDirty(true);
    setResult({ kind: "idle" });
  };

  function review() {
    start(async () => {
      const res = await saveSettings(data);
      if (!res.ok) setResult({ kind: "missing", missing: res.missing });
      else setResult({ kind: "qa", versionId: res.versionId, verdict: res.qa.verdict, flags: res.qa.flags });
      setDirty(false);
    });
  }

  function publish(versionId: string) {
    start(async () => {
      const res = await publishSettings(versionId);
      if (res.ok) setResult({ kind: "published" });
      else setResult({ kind: "error", message: res.error ?? "Couldn't publish." });
    });
  }

  return (
    <div className="space-y-6">
      <ServicesSection data={data} update={update} />
      <HoursSection data={data} update={update} />
      <FaqsSection data={data} update={update} />
      <EmergenciesSection data={data} update={update} />
      <ContactSection data={data} update={update} />
      <VoiceSection data={data} update={update} />

      {/* Sticky action bar */}
      <div className="sticky bottom-4 z-10 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
        <ResultBlock result={result} onPublish={publish} pending={pending} />
        {result.kind !== "qa" && result.kind !== "published" && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {dirty ? "You have unsaved changes." : "Edit any field, then check &amp; publish."}
            </p>
            <button className="btn-primary" disabled={pending} onClick={review}>
              {pending ? "Checking…" : "Check changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultBlock({ result, onPublish, pending }: { result: Result; onPublish: (id: string) => void; pending: boolean }) {
  if (result.kind === "missing") {
    return (
      <div className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
        We still need: {result.missing.join(", ")}.
      </div>
    );
  }
  if (result.kind === "error") {
    return <div className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{result.message}</div>;
  }
  if (result.kind === "published") {
    return <div className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-800">✅ Published — your receptionist is updated.</div>;
  }
  if (result.kind === "qa") {
    if (result.verdict === "go") {
      return (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-green-700">✅ Passed the quality check — ready to publish.</p>
          <button className="btn-primary" disabled={pending} onClick={() => onPublish(result.versionId)}>
            {pending ? "Publishing…" : "Publish changes"}
          </button>
        </div>
      );
    }
    return (
      <div className="rounded-xl bg-amber-50 p-3">
        <p className="text-sm font-medium text-amber-900">A couple of things to fix before publishing:</p>
        <ul className="mt-2 space-y-1 text-sm text-amber-800">
          {result.flags.map((f, i) => (
            <li key={i}>• {f.risk} <span className="text-amber-600">→ {f.fix}</span></li>
          ))}
        </ul>
      </div>
    );
  }
  return null;
}

// ---- sections ----
type P = { data: WizardData; update: (patch: Partial<WizardData>) => void };

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="card p-6">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ServicesSection({ data, update }: P) {
  return (
    <Section title="Services & prices" desc="What your receptionist can talk about and book. Use ranges, never exact prices.">
      <div className="space-y-2">
        {data.services.map((s, i) => (
          <div key={i} className="grid grid-cols-[1fr_140px_auto_auto] items-center gap-2">
            <input className="input" value={s.service} placeholder="Service" onChange={(e) => update({ services: rep(data.services, i, { ...s, service: e.target.value }) })} />
            <input className="input" value={s.priceRange} placeholder="Range (optional)" onChange={(e) => update({ services: rep(data.services, i, { ...s, priceRange: e.target.value }) })} />
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={s.bookable} onChange={(e) => update({ services: rep(data.services, i, { ...s, bookable: e.target.checked }) })} /> Bookable
            </label>
            <button className="text-slate-400 hover:text-red-500" onClick={() => update({ services: rm(data.services, i) })}>✕</button>
          </div>
        ))}
      </div>
      <button className="btn-secondary mt-3" onClick={() => update({ services: [...data.services, { service: "", priceRange: "", bookable: true }] })}>+ Add service</button>
    </Section>
  );
}

function HoursSection({ data, update }: P) {
  const days = Object.keys(DAY_LABELS) as (keyof typeof DAY_LABELS)[];
  return (
    <Section title="Hours" desc="Only these windows are offered for appointments.">
      <div className="space-y-2">
        {days.map((day) => {
          const h = data.hours[day];
          return (
            <div key={day} className="grid grid-cols-[110px_auto_1fr] items-center gap-3">
              <span className="text-sm font-medium text-slate-700">{DAY_LABELS[day]}</span>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                <input type="checkbox" checked={!h.closed} onChange={(e) => update({ hours: { ...data.hours, [day]: { ...h, closed: !e.target.checked } } })} /> Open
              </label>
              {h.closed ? (
                <span className="text-sm text-slate-400">Closed</span>
              ) : (
                <div className="flex items-center gap-2">
                  <input type="time" className="input py-1.5" value={h.open} onChange={(e) => update({ hours: { ...data.hours, [day]: { ...h, open: e.target.value } } })} />
                  <span className="text-slate-400">to</span>
                  <input type="time" className="input py-1.5" value={h.close} onChange={(e) => update({ hours: { ...data.hours, [day]: { ...h, close: e.target.value } } })} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function FaqsSection({ data, update }: P) {
  return (
    <Section title="Common questions" desc="Answered questions the receptionist can handle instantly.">
      <div className="space-y-3">
        {data.faqs.map((f, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <input className="input font-medium" value={f.q} placeholder="Question" onChange={(e) => update({ faqs: rep(data.faqs, i, { ...f, q: e.target.value }) })} />
              <button className="text-slate-400 hover:text-red-500" onClick={() => update({ faqs: rm(data.faqs, i) })}>✕</button>
            </div>
            <textarea className="input mt-2" rows={2} value={f.a} placeholder="Answer" onChange={(e) => update({ faqs: rep(data.faqs, i, { ...f, a: e.target.value }) })} />
          </div>
        ))}
      </div>
      <button className="btn-secondary mt-3" onClick={() => update({ faqs: [...data.faqs, { q: "", a: "" }] })}>+ Add question</button>
    </Section>
  );
}

function EmergenciesSection({ data, update }: P) {
  const def = VERTICAL_DEFS[data.vertical as Vertical];
  const active = new Set(data.emergencies.rules);
  const toggle = (rule: string) => {
    const set = new Set(active);
    set.has(rule) ? set.delete(rule) : set.add(rule);
    update({ emergencies: { ...data.emergencies, rules: [...set] } });
  };
  const suggested = def.hotJobRules;
  const custom = data.emergencies.rules.filter((r) => !suggested.includes(r));
  return (
    <Section title="Emergencies" desc="When a caller describes these, you get an alert.">
      <div className="space-y-2">
        {[...suggested, ...custom].map((rule) => (
          <label key={rule} className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            <input type="checkbox" checked={active.has(rule)} onChange={() => toggle(rule)} />
            <span className="text-slate-700">{rule}</span>
          </label>
        ))}
      </div>
      <div className="mt-3">
        <label className="label mb-1.5 block">Alert number</label>
        <input className="input" value={data.emergencies.alertNumber} onChange={(e) => update({ emergencies: { ...data.emergencies, alertNumber: e.target.value } })} />
      </div>
    </Section>
  );
}

function ContactSection({ data, update }: P) {
  return (
    <Section title="Your phone" desc="Where the receptionist reaches you — and where it rings you when it hands off a live call it can't handle.">
      <label className="label mb-1.5 block">Your mobile number</label>
      <input className="input" value={data.ownerMobile} onChange={(e) => update({ ownerMobile: e.target.value })} placeholder="(555) 123-4567" />
      <p className="mt-1.5 text-xs text-slate-400">
        When the receptionist can&apos;t help a caller, it connects them to this number. Use a line you actually answer — and <strong>not</strong> the business line your calls forward from (that would loop back to the receptionist).
      </p>
    </Section>
  );
}

function VoiceSection({ data, update }: P) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState("");
  function preview(id: string, url: string) {
    audioRef.current?.pause();
    if (playing === id) return setPlaying("");
    const a = new Audio(url);
    audioRef.current = a;
    a.onended = () => setPlaying("");
    a.play().catch(() => setPlaying(""));
    setPlaying(id);
  }
  return (
    <Section title="Voice & greeting" desc="How your receptionist sounds and what it says first.">
      <div className="grid gap-3 sm:grid-cols-2">
        {VOICES.map((v) => {
          const activeV = data.voice === v.id;
          return (
            <div key={v.id} onClick={() => update({ voice: v.id })} className={`cursor-pointer rounded-xl border p-4 transition ${activeV ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">{v.name}</span>
                <button className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-brand-700 shadow-sm ring-1 ring-slate-200" onClick={(e) => { e.stopPropagation(); preview(v.id, v.preview); }}>
                  {playing === v.id ? "❚❚ Playing" : "▶ Preview"}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">{v.desc}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-4">
        <label className="label mb-1.5 block">Greeting</label>
        <textarea className="input" rows={2} value={data.greeting} onChange={(e) => update({ greeting: e.target.value })} />
      </div>
    </Section>
  );
}

function rep<T>(arr: T[], i: number, v: T): T[] {
  const c = [...arr];
  c[i] = v;
  return c;
}
function rm<T>(arr: T[], i: number): T[] {
  return arr.filter((_, idx) => idx !== i);
}
