"use client";

import { useState, useTransition, useEffect } from "react";
import { CARRIERS } from "@/lib/carriers";
import { WebCallButton } from "@/components/web-call-button";
import {
  approveTestAgent,
  reportTestProblem,
  chooseCarrier,
  beginForwardingVerification,
  pollForwarding,
  simulateForwarded,
  submitA2PInfo,
  skipTexting,
} from "./actions";
import type { A2PBusinessInfo } from "@/lib/integrations/twilio";

function CopyNumber({ number }: { number: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(number);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 font-mono text-sm text-white"
    >
      {number} <span className="text-xs text-slate-300">{copied ? "Copied ✓" : "Copy"}</span>
    </button>
  );
}

// --- test_agent -----------------------------------------------------------
export function TestAgentWall({
  agentNumber,
  priorNote,
  hasRealNumber,
  sampleService,
}: {
  agentNumber: string;
  priorNote?: string;
  hasRealNumber: boolean;
  sampleService?: string;
}) {
  const [pending, start] = useTransition();
  const [showProblem, setShowProblem] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  const tests = [
    "Book a fake appointment (give a service and a time).",
    "Ask a price question — it should give a range or say the team confirms.",
    "Ask something it shouldn't know — it should offer to take a message.",
    "Describe an emergency — it should treat it as urgent.",
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Give your receptionist a test call</h2>
        <p className="mt-1 text-sm text-slate-500">Talk to it and try a few things. Make sure it sounds right before you go live.</p>
      </div>

      {/* Primary: in-browser web call — always works, no phone number needed. */}
      <WebCallButton
        liveHint={`Connected — try booking ${sampleService ? `a ${sampleService.toLowerCase()}` : "an appointment"}.`}
      />

      {/* The dialable number: real once Twilio is set up, otherwise a placeholder. */}
      {hasRealNumber ? (
        <div className="rounded-xl bg-brand-50 p-4">
          <p className="text-sm text-brand-800">…or call your receptionist&apos;s number:</p>
          <div className="mt-2">
            <CopyNumber number={agentNumber} />
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          A dialable phone number gets assigned once billing/telephony is connected — for now, use the web call above to test.
        </p>
      )}

      <ol className="space-y-2">
        {tests.map((t, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-100 text-xs">{i + 1}</span>
            {t}
          </li>
        ))}
      </ol>

      {priorNote && !sent && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Thanks — we got your note (&ldquo;{priorNote}&rdquo;) and someone is taking a look. You can still continue below once it sounds right.
        </p>
      )}

      {!showProblem ? (
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" disabled={pending} onClick={() => start(() => approveTestAgent())}>
            It sounds right — continue
          </button>
          <button className="btn-ghost" onClick={() => setShowProblem(true)}>
            Something&apos;s off
          </button>
        </div>
      ) : sent ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Thanks — we&apos;ve flagged this and will take a look. We&apos;ll be in touch.</p>
      ) : (
        <div className="space-y-2">
          <textarea className="input" rows={3} value={note} placeholder="What sounded off?" onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button
              className="btn-primary"
              disabled={pending || !note.trim()}
              onClick={() => start(async () => { await reportTestProblem(note.trim()); setSent(true); })}
            >
              Send to support
            </button>
            <button className="btn-ghost" onClick={() => setShowProblem(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- forwarding -----------------------------------------------------------
export function ForwardingWall({ agentNumber, savedCarrier, devMode }: { agentNumber: string; savedCarrier?: string; devMode: boolean }) {
  const [carrier, setCarrier] = useState<string>(savedCarrier ?? "");
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "verifying" | "failed">("idle");
  const [message, setMessage] = useState("");

  const selected = CARRIERS.find((c) => c.id === carrier);

  // Poll while verifying; the server action advances the run on success.
  useEffect(() => {
    if (state !== "verifying") return;
    const iv = setInterval(async () => {
      const s = await pollForwarding();
      if (s.done || s.status === "verified") {
        window.location.reload();
      } else if (s.status === "failed") {
        setState("failed");
        setMessage(s.message ?? "We didn't detect a forwarded call.");
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [state]);

  function pick(id: string) {
    setCarrier(id);
    start(() => chooseCarrier(id));
  }

  function verify() {
    setMessage("");
    start(async () => {
      const res = await beginForwardingVerification();
      if (res.started) setState("verifying");
      else {
        setState("failed");
        setMessage(res.message ?? "Couldn't start the test call.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Forward calls you don&apos;t answer</h2>
        <p className="mt-1 text-sm text-slate-500">
          Send calls your team doesn&apos;t pick up to your receptionist. Pick your phone provider for the exact steps.
        </p>
      </div>

      <div>
        <span className="label">Your phone provider</span>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {CARRIERS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c.id)}
              className={`rounded-xl border p-3 text-left text-sm transition ${carrier === c.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-slate-200 hover:border-slate-300"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="mb-2 text-sm font-medium text-slate-700">Steps for {selected.name}:</p>
          <ol className="space-y-1.5 text-sm text-slate-600">
            {selected.steps.map((s, i) => {
              const parts = s.split("{NUMBER}");
              return (
                <li key={i} className="flex gap-2">
                  <span className="text-slate-400">{i + 1}.</span>
                  <span>
                    {parts[0]}
                    {parts.length > 1 && <span className="font-mono font-semibold text-slate-900">{agentNumber}</span>}
                    {parts[1]}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="mt-3">
            <CopyNumber number={agentNumber} />
          </div>
          {selected.turnOff && <p className="mt-3 text-xs text-slate-400">{selected.turnOff}</p>}
        </div>
      )}

      {carrier && state === "idle" && (
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-slate-600">Once you&apos;ve set forwarding, we&apos;ll place a test call to your business line. <strong>Don&apos;t answer it</strong> — if forwarding works, it&apos;ll reach your receptionist and we&apos;ll confirm automatically.</p>
          <button className="btn-primary mt-3" disabled={pending} onClick={verify}>
            {pending ? "Starting…" : "Verify forwarding"}
          </button>
        </div>
      )}

      {state === "verifying" && (
        <div className="rounded-xl bg-brand-50 p-4">
          <p className="text-sm text-brand-800">📞 Calling your business line now — please don&apos;t answer. Waiting to detect the forwarded call…</p>
          {devMode && (
            <button className="btn-secondary mt-3" onClick={() => start(() => simulateForwarded())}>
              Dev: simulate the forwarded call
            </button>
          )}
        </div>
      )}

      {state === "failed" && (
        <div className="rounded-xl bg-amber-50 p-4">
          <p className="text-sm text-amber-800">{message || "We didn't detect a forwarded call."}</p>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" disabled={pending} onClick={verify}>
              Try again
            </button>
            <a className="btn-ghost" href="mailto:support@switchboard.example">
              Get help
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// --- a2p ------------------------------------------------------------------
export function A2PWall({ defaults }: { defaults: Partial<A2PBusinessInfo> }) {
  const [pending, start] = useTransition();
  const [form, setForm] = useState<A2PBusinessInfo>({
    legalName: defaults.legalName ?? "",
    ein: defaults.ein ?? "",
    address: defaults.address ?? "",
    contactName: defaults.contactName ?? "",
    contactEmail: defaults.contactEmail ?? "",
    phone: defaults.phone ?? "",
    website: defaults.website ?? "",
  });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof A2PBusinessInfo, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    if (!form.legalName.trim() || !form.ein.trim() || !form.address.trim() || !form.contactEmail.trim()) {
      setError("Please fill in your legal business name, EIN, address, and contact email.");
      return;
    }
    if (!consent) {
      setError("Please agree to receive text alerts — carriers require documented opt-in.");
      return;
    }
    setError("");
    start(async () => {
      try {
        await submitA2PInfo(form, consent);
      } catch (e) {
        const msg = (e as Error).message;
        if (!msg?.includes("NEXT_REDIRECT")) setError(msg);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Turn on texting</h2>
        <p className="mt-1 text-sm text-slate-500">
          To text your customers (missed-call text-back, appointment confirmations), U.S. carriers require a quick
          business registration. We submit it for you — approval usually takes a few days and happens in the background,
          so you can go live now either way.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Legal business name">
          <input className="input" value={form.legalName} onChange={(e) => set("legalName", e.target.value)} placeholder="Riverside Auto Care LLC" />
        </Field>
        <Field label="EIN (tax ID)">
          <input className="input" value={form.ein} onChange={(e) => set("ein", e.target.value)} placeholder="12-3456789" />
        </Field>
      </div>
      <Field label="Business address">
        <input className="input" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St, Austin, TX 78701" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact name">
          <input className="input" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="Jane Owner" />
        </Field>
        <Field label="Contact email">
          <input className="input" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="jane@riversideauto.com" />
        </Field>
      </div>

      <label className="flex items-start gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          I agree to receive automated text alerts about my business (new bookings, urgent calls) at my mobile number.
          Message frequency varies; message &amp; data rates may apply. Reply STOP to unsubscribe, HELP for help.
        </span>
      </label>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" disabled={pending} onClick={submit}>
          {pending ? "Submitting…" : "Submit & continue"}
        </button>
        <button className="btn-ghost" disabled={pending} onClick={() => start(() => skipTexting())}>
          Skip texting for now
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
