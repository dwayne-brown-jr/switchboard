"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { saveDraft, finishWizard, runPrefill } from "./actions";
import { defaultWizardData, reseedForVertical, composeGreeting } from "@/lib/wizard-defaults";
import { VERTICAL_DEFS, VERTICALS, DAY_LABELS, VOICES, isVertical, type Vertical } from "@/lib/verticals";
import type { WizardData } from "@/lib/schemas";

const STEPS = ["Your shop", "Services", "Hours", "Questions", "Emergencies", "Voice", "Review"];
// Steps already behind the owner before the wizard opens (account + business
// type pre-selected) — counted so progress never starts at zero.
const PRE_DONE = 2;
const US_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export function SetupWizard({ initial }: { initial: WizardData | null }) {
  const [data, setData] = useState<WizardData>(initial ?? defaultWizardData("auto"));
  const [step, setStep] = useState<number>(initial?.step ?? 0);
  // Furthest step the owner has reached — steps up to here are jump-able.
  const [maxReached, setMaxReached] = useState<number>(initial?.step ?? 0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [fromDemo, setFromDemo] = useState(false);

  const update = (patch: Partial<WizardData>) => setData((d) => ({ ...d, ...patch }));

  // Carry over anything the visitor typed into the landing-page demo so they
  // don't start from a blank form. Only for a fresh wizard — never a saved draft.
  useEffect(() => {
    if (initial) return;
    try {
      const raw = localStorage.getItem("sb-demo");
      if (!raw) return;
      const saved = JSON.parse(raw) as { vertical?: string; business?: string; city?: string };
      if (!saved.business && !saved.city) return;
      setData((d) => {
        const base = saved.vertical && isVertical(saved.vertical) && saved.vertical !== d.vertical ? reseedForVertical(d, saved.vertical) : d;
        return { ...base, businessName: saved.business ?? base.businessName, city: saved.city ?? base.city };
      });
      setFromDemo(true);
      localStorage.removeItem("sb-demo");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goto(next: number) {
    setError("");
    const payload = { ...data, step: next };
    setData(payload);
    setStep(next);
    setMaxReached((m) => Math.max(m, next));
    startTransition(async () => {
      try {
        await saveDraft(payload);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function next() {
    const msg = validateStep(step, data);
    if (msg) {
      setError(msg);
      return;
    }
    goto(Math.min(step + 1, STEPS.length - 1));
  }
  function back() {
    goto(Math.max(step - 1, 0));
  }
  // Jump straight to any step already visited (via the stepper header).
  function jumpTo(target: number) {
    if (target === step || target > maxReached) return;
    // Going forward past the current step still respects this step's validation.
    if (target > step) {
      const msg = validateStep(step, data);
      if (msg) {
        setError(msg);
        return;
      }
    }
    goto(target);
  }

  function finish() {
    setError("");
    const payload = { ...data, step };
    startTransition(async () => {
      try {
        await finishWizard(payload);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  const pct = Math.round(((PRE_DONE + step) / (PRE_DONE + STEPS.length)) * 100);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-slate-500">
            <span className="font-semibold text-green-600">✓</span> Account created · {STEPS[step]}
          </span>
          <span className="font-semibold text-brand-700">{pct}% done</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <Stepper step={step} maxReached={maxReached} onJump={jumpTo} />
      {fromDemo && (
        <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          ✓ We kept what you tried in the demo — tweak anything below.
        </p>
      )}
      <div className="card mt-6 p-6 sm:p-8">
        {step === 0 && <BusinessStep data={data} update={update} />}
        {step === 1 && <ServicesStep data={data} update={update} />}
        {step === 2 && <HoursStep data={data} update={update} />}
        {step === 3 && <FaqsStep data={data} update={update} />}
        {step === 4 && <EmergenciesStep data={data} update={update} />}
        {step === 5 && <VoiceStep data={data} update={update} />}
        {step === 6 && <ReviewStep data={data} />}

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-8 flex items-center justify-between">
          <button className="btn-ghost" onClick={back} disabled={step === 0 || pending}>
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button className="btn-primary" onClick={next} disabled={pending}>
              {pending ? "Saving…" : "Continue"}
            </button>
          ) : (
            <button className="btn-primary" onClick={finish} disabled={pending}>
              {pending ? "Building…" : "Create my receptionist"}
            </button>
          )}
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">
        Your progress saves automatically — you can leave and come back anytime.
      </p>
    </div>
  );
}

function Stepper({ step, maxReached, onJump }: { step: number; maxReached: number; onJump: (i: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STEPS.map((label, i) => {
        const reachable = i <= maxReached && i !== step;
        return (
          <button
            key={label}
            type="button"
            onClick={() => reachable && onJump(i)}
            disabled={!reachable}
            title={reachable ? `Go to ${label}` : undefined}
            className={`flex items-center gap-1.5 rounded-full px-1 py-0.5 transition ${reachable ? "cursor-pointer hover:bg-slate-100" : "cursor-default"}`}
          >
            <span
              className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${
                i < step ? "bg-brand-600 text-white" : i === step ? "bg-brand-100 text-brand-700 ring-2 ring-brand-500" : "bg-slate-100 text-slate-400"
              }`}
            >
              {i < step ? "✓" : i + 1}
            </span>
            <span className={`hidden pr-1 text-xs sm:inline ${i === step ? "font-semibold text-slate-800" : reachable ? "text-slate-600" : "text-slate-400"}`}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------------
// Step 0 — Business
// --------------------------------------------------------------------------
function BusinessStep({ data, update }: StepProps) {
  // Fill the time zone from the browser up front — most owners never need to
  // touch it, and the select stays as the override.
  useEffect(() => {
    if (data.timezone) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) update({ timezone: tz });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="space-y-5">
      <Header title="Tell us about your shop" subtitle="The basics your receptionist needs to greet callers." />
      <Field label="Business name">
        <input className="input" value={data.businessName} onChange={(e) => update({ businessName: e.target.value })} placeholder="e.g. Riverside Auto Care" />
      </Field>
      <div>
        <span className="label">What kind of business?</span>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {VERTICALS.map((v) => {
            const def = VERTICAL_DEFS[v as Vertical];
            const active = data.vertical === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => {
                  // Re-tapping the already-selected type must NOT reseed — that
                  // would wipe the owner's services/FAQs/emergency edits.
                  if (data.vertical !== v) update(reseedForVertical(data, v as Vertical));
                }}
                className={`rounded-xl border p-4 text-left transition ${active ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-slate-200 hover:border-slate-300"}`}
              >
                <div className="text-sm font-semibold text-slate-900">{def.label}</div>
                <div className="mt-1 text-xs text-slate-500">{def.tagline}</div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-400">Changing this refreshes your starter services and questions.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City">
          <input className="input" value={data.city} onChange={(e) => update({ city: e.target.value })} placeholder="e.g. Austin, TX" />
        </Field>
        <Field label="Time zone" hint="Detected from your browser — change it if it's wrong.">
          <select className="input" value={data.timezone} onChange={(e) => update({ timezone: e.target.value })}>
            <option value="">Select…</option>
            {US_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace("America/", "").replace("Pacific/", "").replace("_", " ")}
              </option>
            ))}
            {data.timezone && !US_TIMEZONES.includes(data.timezone) && <option value={data.timezone}>{data.timezone}</option>}
          </select>
        </Field>
      </div>
      <Field label="Website (optional)" hint="We can read your site to fill in services and hours for you.">
        <input className="input" value={data.websiteUrl} onChange={(e) => update({ websiteUrl: e.target.value })} placeholder="yourshop.com" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Main business phone" hint="The number customers call today.">
          <input className="input" value={data.businessNumber} onChange={(e) => update({ businessNumber: e.target.value })} placeholder="(555) 123-4567" />
        </Field>
        <Field label="Your mobile" hint="Where we text you about emergencies.">
          <input className="input" value={data.ownerMobile} onChange={(e) => update({ ownerMobile: e.target.value })} placeholder="(555) 987-6543" />
        </Field>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step 1 — Services (with website prefill)
// --------------------------------------------------------------------------
function ServicesStep({ data, update }: StepProps) {
  const [prefilling, setPrefilling] = useState(false);
  const [prefillMsg, setPrefillMsg] = useState("");

  async function prefill() {
    setPrefilling(true);
    setPrefillMsg("");
    try {
      const res = await runPrefill(data.websiteUrl, data.vertical);
      const foundServices = res.services.filter((s) => s.service.trim());
      const foundFaqs = res.faqs.filter((f) => f.q.trim());
      if (foundServices.length === 0 && foundFaqs.length === 0) {
        setPrefillMsg("We couldn't find much on the site — no problem, just fill it in below.");
      } else {
        const patch: Partial<WizardData> = {};
        if (foundServices.length) patch.services = mergeServices(data.services, foundServices);
        if (foundFaqs.length) patch.faqs = mergeFaqs(data.faqs, foundFaqs);
        if (res.city && !data.city) patch.city = res.city;
        if (res.serviceArea && !data.serviceArea) patch.serviceArea = res.serviceArea;
        update(patch);
        setPrefillMsg(`Added ${foundServices.length} services and ${foundFaqs.length} answers from your website. Review them below.`);
      }
    } finally {
      setPrefilling(false);
    }
  }

  return (
    <div className="space-y-5">
      <Header title="Your services" subtitle="These are the jobs your receptionist can talk about and book." />
      {data.websiteUrl.trim() && (
        <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
          <span className="text-sm text-brand-800">Read services &amp; answers from {data.websiteUrl}?</span>
          <button type="button" className="btn-secondary" onClick={prefill} disabled={prefilling}>
            {prefilling ? "Reading…" : "Prefill from site"}
          </button>
        </div>
      )}
      {prefillMsg && <p className="text-sm text-slate-600">{prefillMsg}</p>}
      <div className="space-y-3">
        {data.services.map((s, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_92px_auto_auto] items-center gap-2">
            <input
              className="input"
              value={s.service}
              placeholder="Service name"
              onChange={(e) => update({ services: replaceAt(data.services, i, { ...s, service: e.target.value }) })}
            />
            <input
              className="input"
              value={s.priceRange}
              placeholder="Price (optional)"
              onChange={(e) => update({ services: replaceAt(data.services, i, { ...s, priceRange: e.target.value }) })}
            />
            <input
              className="input"
              type="number"
              min={1}
              step={5}
              value={s.durationMin ?? ""}
              placeholder="Min"
              title="How long this job takes, in minutes (leave blank to use your default)"
              disabled={!s.bookable}
              onChange={(e) => update({ services: replaceAt(data.services, i, { ...s, durationMin: parsePosInt(e.target.value) }) })}
            />
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={s.bookable} onChange={(e) => update({ services: replaceAt(data.services, i, { ...s, bookable: e.target.checked }) })} />
              Bookable
            </label>
            <button type="button" className="text-slate-400 hover:text-red-500" onClick={() => update({ services: removeAt(data.services, i) })} aria-label="Remove">
              ✕
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn-secondary" onClick={() => update({ services: [...data.services, { service: "", priceRange: "", bookable: true }] })}>
        + Add a service
      </button>
      <p className="text-xs text-slate-400">
        The <strong>Min</strong> column is how long each job takes — leave it blank to use your default appointment length (set on the next step). Leave price ranges blank if you&apos;d rather not quote.
      </p>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step 2 — Hours
// --------------------------------------------------------------------------
function HoursStep({ data, update }: StepProps) {
  const days = Object.keys(DAY_LABELS) as (keyof typeof DAY_LABELS)[];
  return (
    <div className="space-y-5">
      <Header title="When are you open?" subtitle="Your receptionist only offers appointment times during these hours." />
      <div className="space-y-2">
        {days.map((day) => {
          const h = data.hours[day];
          return (
            <div key={day} className="grid grid-cols-[110px_auto_1fr] items-center gap-3">
              <span className="text-sm font-medium text-slate-700">{DAY_LABELS[day]}</span>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={!h.closed}
                  onChange={(e) => update({ hours: { ...data.hours, [day]: { ...h, closed: !e.target.checked } } })}
                />
                Open
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

      <div className="space-y-4 rounded-xl border border-slate-200 p-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-800">How you take appointments</h4>
          <p className="text-xs text-slate-500">This is how your receptionist decides which times to offer. You can change it anytime.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Jobs at once"
            hint="How many appointments you can handle at the same time (e.g. 1 mobile van, or 3 bays)."
            value={data.capacity}
            min={1}
            step={1}
            onChange={(v) => update({ capacity: v ?? 1 })}
          />
          <NumberField
            label="Default length (min)"
            hint="Typical appointment length. Per-service times on the Services step override this."
            value={data.defaultDurationMin}
            min={5}
            step={5}
            onChange={(v) => update({ defaultDurationMin: v ?? 60 })}
          />
          <NumberField
            label="Travel/gap (min)"
            hint="Buffer left around each job — useful for mobile businesses that drive between appointments. 0 for none."
            value={data.bufferMin}
            min={0}
            step={5}
            onChange={(v) => update({ bufferMin: v ?? 0 })}
          />
        </div>
      </div>
    </div>
  );
}

// A labeled numeric input used by the scheduling controls.
function NumberField({
  label,
  hint,
  value,
  min,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  step: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        className="input mt-1"
        type="number"
        inputMode="numeric"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(parsePosInt(e.target.value))}
      />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

// --------------------------------------------------------------------------
// Step 3 — FAQs
// --------------------------------------------------------------------------
function FaqsStep({ data, update }: StepProps) {
  return (
    <div className="space-y-5">
      <Header title="Common questions" subtitle="Answer these and your receptionist can handle them instantly. Leave any blank and it'll take a message instead." />
      <div className="space-y-4">
        {data.faqs.map((f, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <input
                className="input font-medium"
                value={f.q}
                placeholder="Question"
                onChange={(e) => update({ faqs: replaceAt(data.faqs, i, { ...f, q: e.target.value }) })}
              />
              <button type="button" className="text-slate-400 hover:text-red-500" onClick={() => update({ faqs: removeAt(data.faqs, i) })} aria-label="Remove">
                ✕
              </button>
            </div>
            <textarea
              className="input mt-2"
              rows={2}
              value={f.a}
              placeholder="Your answer (keep it short and friendly)"
              onChange={(e) => update({ faqs: replaceAt(data.faqs, i, { ...f, a: e.target.value }) })}
            />
          </div>
        ))}
      </div>
      <button type="button" className="btn-secondary" onClick={() => update({ faqs: [...data.faqs, { q: "", a: "" }] })}>
        + Add a question
      </button>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step 4 — Emergencies
// --------------------------------------------------------------------------
function EmergenciesStep({ data, update }: StepProps) {
  const def = VERTICAL_DEFS[data.vertical as Vertical];
  const [custom, setCustom] = useState("");
  // Pre-fill the alert number with the owner's mobile as a REAL value, not a
  // placeholder — most owners keep the default, so make the default visible.
  useEffect(() => {
    if (!data.emergencies.alertNumber.trim() && data.ownerMobile.trim()) {
      update({ emergencies: { ...data.emergencies, alertNumber: data.ownerMobile } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const active = new Set(data.emergencies.rules);
  function toggle(rule: string) {
    const set = new Set(active);
    if (set.has(rule)) set.delete(rule);
    else set.add(rule);
    update({ emergencies: { ...data.emergencies, rules: [...set] } });
  }
  const suggested = def.hotJobRules;
  const customRules = data.emergencies.rules.filter((r) => !suggested.includes(r));
  return (
    <div className="space-y-5">
      <Header title="What counts as an emergency?" subtitle="When a caller describes one of these, your receptionist texts you right away." />
      <div className="space-y-2">
        {suggested.map((rule) => (
          <label key={rule} className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            <input type="checkbox" checked={active.has(rule)} onChange={() => toggle(rule)} />
            <span className="text-slate-700">{rule}</span>
          </label>
        ))}
        {customRules.map((rule) => (
          <label key={rule} className="flex items-center gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-sm">
            <input type="checkbox" checked onChange={() => toggle(rule)} />
            <span className="text-slate-700">{rule}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="input" value={custom} placeholder="Add your own emergency situation" onChange={(e) => setCustom(e.target.value)} />
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            if (custom.trim()) {
              update({ emergencies: { ...data.emergencies, rules: [...data.emergencies.rules, custom.trim()] } });
              setCustom("");
            }
          }}
        >
          Add
        </button>
      </div>
      <Field label="Alert this number for emergencies" hint="We've filled in your mobile — change it if alerts should go somewhere else.">
        <input
          className="input"
          value={data.emergencies.alertNumber}
          placeholder={data.ownerMobile || "(555) 987-6543"}
          onChange={(e) => update({ emergencies: { ...data.emergencies, alertNumber: e.target.value } })}
        />
      </Field>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step 5 — Voice & greeting
// --------------------------------------------------------------------------
function VoiceStep({ data, update }: StepProps) {
  const greeting = data.greeting || composeGreeting(data.businessName);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string>("");
  // Persist the auto-composed greeting so it saves even if the owner never edits it.
  useEffect(() => {
    if (!data.greeting.trim()) update({ greeting });
    return () => audioRef.current?.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function playPreview(id: string, url: string) {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playing === id) {
      setPlaying("");
      return;
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlaying("");
    audio.play().catch(() => setPlaying(""));
    setPlaying(id);
  }

  return (
    <div className="space-y-5">
      <Header title="Pick a voice" subtitle="Tap ▶ to hear each one — this is exactly how your receptionist will sound." />
      <div className="grid gap-3 sm:grid-cols-2">
        {VOICES.map((v) => {
          const active = data.voice === v.id;
          const isPlaying = playing === v.id;
          return (
            <div
              key={v.id}
              onClick={() => update({ voice: v.id })}
              className={`cursor-pointer rounded-xl border p-4 text-left transition ${active ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-slate-200 hover:border-slate-300"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">{v.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    playPreview(v.id, v.preview);
                  }}
                  className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-brand-700 shadow-sm ring-1 ring-slate-200 hover:bg-brand-50"
                >
                  {isPlaying ? "❚❚ Playing" : "▶ Preview"}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">{v.desc}</p>
            </div>
          );
        })}
      </div>
      <Field label="Greeting" hint="The first thing callers hear. Keep it friendly.">
        <textarea className="input" rows={2} value={greeting} onChange={(e) => update({ greeting: e.target.value })} />
      </Field>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step 6 — Review
// --------------------------------------------------------------------------
function ReviewStep({ data }: { data: WizardData }) {
  const bookable = data.services.filter((s) => s.bookable && s.service.trim());
  const answered = data.faqs.filter((f) => f.a.trim());
  return (
    <div className="space-y-5">
      <Header title="Ready to build" subtitle="Here's what your receptionist will know. You can change anything later." />
      <dl className="space-y-3 text-sm">
        <ReviewRow label="Business" value={`${data.businessName || "—"} · ${VERTICAL_DEFS[data.vertical as Vertical].label}`} />
        <ReviewRow label="Location" value={[data.city, data.timezone].filter(Boolean).join(" · ") || "—"} />
        <ReviewRow label="Bookable services" value={bookable.map((s) => s.service).join(", ") || "—"} />
        <ReviewRow label="Answered questions" value={`${answered.length} of ${data.faqs.length}`} />
        <ReviewRow label="Emergencies flagged" value={`${data.emergencies.rules.length} situations`} />
        <ReviewRow label="Alert number" value={data.emergencies.alertNumber || data.ownerMobile || "—"} />
        <ReviewRow label="Voice" value={VOICES.find((v) => v.id === data.voice)?.name ?? data.voice} />
      </dl>
      <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        When you click <span className="font-semibold">Create my receptionist</span>, we&apos;ll build it and run a quality check. If anything needs
        your attention, we&apos;ll show you exactly what to fix.
      </p>
    </div>
  );
}

// --------------------------------------------------------------------------
// Shared bits
// --------------------------------------------------------------------------
type StepProps = { data: WizardData; update: (patch: Partial<WizardData>) => void };

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {hint && <p className="mb-1.5 text-xs text-slate-400">{hint}</p>}
      <div className={hint ? "" : "mt-1.5"}>{children}</div>
    </div>
  );
}
function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function validateStep(step: number, data: WizardData): string {
  if (step === 0) {
    if (!data.businessName.trim()) return "Please enter your business name.";
    if (!data.city.trim()) return "Please enter your city.";
    if (!data.timezone.trim()) return "Please pick your time zone.";
    if (!data.businessNumber.trim()) return "Please enter your main business phone.";
    if (!data.ownerMobile.trim()) return "Please enter your mobile number for alerts.";
  }
  if (step === 1 && !data.services.some((s) => s.bookable && s.service.trim())) {
    return "Add at least one bookable service.";
  }
  if (step === 2 && !Object.values(data.hours).some((h) => !h.closed && h.open && h.close)) {
    return "Set hours for at least one day.";
  }
  if (step === 4 && !data.emergencies.alertNumber.trim() && !data.ownerMobile.trim()) {
    return "Add a number to alert for emergencies.";
  }
  return "";
}

// list helpers
function replaceAt<T>(arr: T[], i: number, v: T): T[] {
  const copy = [...arr];
  copy[i] = v;
  return copy;
}
function removeAt<T>(arr: T[], i: number): T[] {
  return arr.filter((_, idx) => idx !== i);
}
// Positive integer from an input, or undefined when empty/zero/invalid — so
// callers apply their own default (blank per-service duration → shop default).
function parsePosInt(v: string): number | undefined {
  const n = parseInt(v.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
function mergeServices(existing: WizardData["services"], found: WizardData["services"]) {
  const names = new Set(existing.map((s) => s.service.toLowerCase().trim()));
  return [...existing, ...found.filter((s) => s.service.trim() && !names.has(s.service.toLowerCase().trim()))];
}
function mergeFaqs(existing: WizardData["faqs"], found: WizardData["faqs"]) {
  const out = [...existing];
  for (const f of found) {
    const idx = out.findIndex((e) => e.q.toLowerCase().trim() === f.q.toLowerCase().trim());
    if (idx >= 0 && !out[idx].a.trim() && f.a.trim()) out[idx] = { ...out[idx], a: f.a };
    else if (idx < 0 && f.q.trim()) out.push(f);
  }
  return out;
}
