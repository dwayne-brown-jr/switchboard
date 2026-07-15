import Link from "next/link";
import type { ReactNode } from "react";
import { PLANS } from "@/lib/plans";
import { VERTICALS, VERTICAL_DEFS, type Vertical } from "@/lib/verticals";
import { DemoCall } from "@/components/demo-call";
import { HeroCall } from "@/components/hero-call";
import { RoiCalculator } from "@/components/roi-calculator";
import { Reveal } from "@/components/reveal";
import { ScrollLink } from "@/components/scroll-link";
import { DEMO_TYPES, demoAgentEnvKey } from "@/lib/demo";

// --- tiny inline icon set (Lucide-style, currentColor stroke) ---------------
const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    {children}
  </svg>
);
const icons: Record<string, ReactNode> = {
  phone: svg(
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />,
  ),
  calendar: svg(
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18M8 2v4M16 2v4m-7 10 2 2 4-4" />
    </>,
  ),
  bolt: svg(<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />),
  sliders: svg(
    <>
      <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />
    </>,
  ),
  shield: svg(
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </>,
  ),
  chat: svg(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
};

const steps = [
  { n: "01", title: "Answer a few questions", body: "Tell us your business type, hours, services, and prices in a short guided setup. No scripts to write, no tech skills needed." },
  { n: "02", title: "We build your receptionist", body: "Switchboard turns your answers into a fully configured phone assistant — voice, booking calendar, and a phone number — and safety-checks it before it can go live." },
  { n: "03", title: "Test it, then go live", body: "Call your receptionist right from your browser to hear it in action. When it sounds right, forward your calls and it starts answering." },
  { n: "04", title: "It answers while you work", body: "Every call your team can't get to is picked up, answered, and booked — and the emergencies get texted straight to you." },
];

const features = [
  { icon: "phone", title: "Answers every call", body: "Nights, weekends, or when you're heads-down on a job — a friendly voice picks up on the first ring, every time." },
  { icon: "calendar", title: "Books the job", body: "It knows your services and hours, offers real openings, and drops the appointment straight onto your calendar." },
  { icon: "bolt", title: "Flags the urgent ones", body: "A no-heat call in a cold snap, a big fleet job, a move-out deadline — it texts you right away so the ones that matter never slip through." },
];

const control = [
  { icon: "sliders", title: "You edit plain fields, not scripts", body: "Change a price, an hour, or an FAQ in a simple form. You never touch a raw AI prompt." },
  { icon: "shield", title: "A safety check runs every time", body: "Before any change goes live, Switchboard checks it — so your receptionist never promises an exact price or drops an emergency." },
  { icon: "chat", title: "Honest with your callers", body: "It tells callers it's an automated assistant, stays on your business only, and hands off to you when it should." },
];

const faqs = [
  { q: "Do I need a new phone or phone system?", a: "No. You keep your current number and simply forward calls you can't get to. Switchboard provides the receptionist and, if you want, a dedicated number that answers and texts." },
  { q: "Will callers know it's not a person?", a: "Yes — it's upfront that it's an automated assistant if asked. Most callers just want a fast, helpful answer and a booked appointment, which is exactly what it delivers." },
  { q: "What if it doesn't know something?", a: "It says so honestly and takes a message or books a callback. It never makes up prices or guesses at a diagnosis." },
  { q: "How long does setup take?", a: "About 10 minutes. You answer a short set of questions, hear your receptionist, and go live the same day." },
];

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-600">{children}</p>;
}

export default function Home() {
  // Real demo calls only offered when every demo agent is provisioned (env set).
  const realCallEnabled = Boolean(process.env.RETELL_API_KEY) && DEMO_TYPES.every((t) => process.env[demoAgentEnvKey(t.id)]);

  return (
    <div className="min-h-full">
      {/* Sticky glass header */}
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5 font-display text-lg font-bold text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">S</span>
            Switchboard
          </div>
          <nav className="flex items-center gap-1">
            <ScrollLink href="#demo" className="btn-ghost hidden sm:inline-flex">Live demo</ScrollLink>
            <ScrollLink href="#how-it-works" className="btn-ghost hidden sm:inline-flex">How it works</ScrollLink>
            <ScrollLink href="#pricing" className="btn-ghost hidden sm:inline-flex">Pricing</ScrollLink>
            <Link href="/login" className="btn-ghost">Sign in</Link>
            <Link href="/login" className="btn-accent ml-1">Get started</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mesh pointer-events-none absolute inset-0" />
          <div className="dot-grid pointer-events-none absolute inset-0" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
            <div>
              <div className="rise inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 backdrop-blur" style={{ animationDelay: "0ms" }}>
                <span className="relative inline-flex h-2 w-2 text-accent-500">
                  <span className="ping-ring absolute inline-flex h-2 w-2 rounded-full" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
                </span>
                For local service businesses that live on the phone
              </div>
              <h1 className="rise mt-5 max-w-2xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl" style={{ animationDelay: "80ms" }}>
                Never miss another call — <span className="text-gradient">or the job that came with it.</span>
              </h1>
              <p className="rise mt-6 max-w-xl text-lg leading-8 text-slate-600" style={{ animationDelay: "160ms" }}>
                Switchboard sets up a friendly AI receptionist that answers every call, books appointments, and texts you
                the urgent ones. You answer a few questions about your shop; we build and configure the rest.
              </p>
              <div className="rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "240ms" }}>
                <Link href="/login" className="btn-accent px-5 py-3 text-base">Set up my receptionist</Link>
                <ScrollLink href="#demo" className="btn-secondary px-5 py-3 text-base">▶ Hear it live</ScrollLink>
              </div>
              <div className="rise mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500" style={{ animationDelay: "320ms" }}>
                {["Keep your current number", "Answers 24/7", "Go live the same day"].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    <span className="text-accent-500">✓</span> {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="rise flex justify-center lg:justify-end" style={{ animationDelay: "300ms" }}>
              <HeroCall />
            </div>
          </div>
        </section>

        {/* Live demo */}
        <section id="demo" className="scroll-mt-16 border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <Eyebrow>Live demo</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold text-slate-900 sm:text-4xl">Hear it for yourself</h2>
              <p className="mt-3 max-w-xl text-slate-600">
                Pick a business type, make it yours, and have a real conversation with the AI receptionist — a live voice,
                right in your browser. No sign-up, no phone needed.
              </p>
            </Reveal>
            <Reveal delay={100} className="mt-10 rounded-3xl border border-slate-200 bg-slate-50/60 p-6 sm:p-8">
              <DemoCall realCallEnabled={realCallEnabled} />
            </Reveal>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <Eyebrow>How it works</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold text-slate-900 sm:text-4xl">Live the same day</h2>
              <p className="mt-3 max-w-xl text-slate-600">From sign-up to a receptionist answering your phone — start to finish in an afternoon.</p>
            </Reveal>
            <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => (
                <Reveal as="li" key={s.n} delay={i * 90} className="group relative rounded-2xl border border-slate-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-accent-200 hover:shadow-lg hover:shadow-accent-500/5">
                  <span className="font-display text-3xl font-extrabold text-slate-200 transition group-hover:text-accent-400">{s.n}</span>
                  <h3 className="mt-3 text-base font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{s.body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* What it does */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <Eyebrow>What it does</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold text-slate-900 sm:text-4xl">A front desk that never clocks out</h2>
            </Reveal>
            <div className="mt-10 grid gap-5 sm:grid-cols-3">
              {features.map((f, i) => (
                <Reveal key={f.title} delay={i * 90} className="group rounded-2xl border border-slate-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-500/5">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 transition group-hover:bg-accent-50 group-hover:text-accent-600 group-hover:ring-accent-100">
                    {icons[f.icon]}
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{f.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{f.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Who it's for */}
        <section className="border-t border-slate-200">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <Eyebrow>Who it's for</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold text-slate-900 sm:text-4xl">Built for your kind of business</h2>
              <p className="mt-3 max-w-xl text-slate-600">
                Pre-tuned for common local trades — the right questions, services, and emergency rules already set up.
                Don't see yours? Pick <span className="font-medium text-slate-800">Other local service</span> and it adapts.
              </p>
            </Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {VERTICALS.map((v, i) => {
                const def = VERTICAL_DEFS[v as Vertical];
                return (
                  <Reveal key={v} delay={i * 60} className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-accent-300 hover:shadow-md">
                    <span className="mt-0.5 h-8 w-1.5 shrink-0 rounded-full bg-slate-200 transition group-hover:bg-accent-500" />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{def.label}</div>
                      <div className="mt-1 text-xs text-slate-500">{def.tagline}</div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* You stay in control */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <Eyebrow>Guardrails, not guesswork</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold text-slate-900 sm:text-4xl">You stay in control</h2>
              <p className="mt-3 max-w-xl text-slate-600">Your receptionist only ever says what you'd want it to. No AI prompt to wrangle, no surprises.</p>
            </Reveal>
            <div className="mt-10 grid gap-5 sm:grid-cols-3">
              {control.map((c, i) => (
                <Reveal key={c.title} delay={i * 90} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-accent-600 shadow-sm ring-1 ring-slate-200">{icons[c.icon]}</span>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{c.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{c.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-16 border-t border-slate-200">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <Eyebrow>Pricing</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold text-slate-900 sm:text-4xl">Simple, flat pricing</h2>
              <p className="mt-3 max-w-xl text-slate-600">
                One flat price — $149/mo with 500 talk-minutes included (about 5–6 calls a day). No per-call surprises;
                if a busy month runs long, we scale your minutes and tell you first. See what missed calls are already
                costing you:
              </p>
            </Reveal>
            <Reveal delay={60} className="mt-8">
              <RoiCalculator />
            </Reveal>
            <div className={`mt-10 items-start gap-5 ${PLANS.length === 1 ? "mx-auto max-w-sm" : "grid sm:grid-cols-3"}`}>
              {PLANS.map((p, i) => (
                <Reveal
                  key={p.id}
                  delay={i * 90}
                  className={`relative flex flex-col rounded-2xl border bg-white p-6 transition duration-300 hover:-translate-y-1 ${
                    p.popular ? "border-accent-300 shadow-xl shadow-accent-500/10" : "border-slate-200 hover:shadow-lg"
                  }`}
                >
                  {p.popular && PLANS.length > 1 && (
                    <span className="absolute -top-3 left-6 rounded-full bg-accent-500 px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm shadow-accent-500/30">Most popular</span>
                  )}
                  <h3 className="font-display text-lg font-bold text-slate-900">{p.name}</h3>
                  <p className="text-sm text-slate-500">{p.tagline}</p>
                  <p className="mt-4 font-display text-4xl font-extrabold text-slate-900">
                    ${p.price}
                    <span className="text-base font-normal text-slate-500">/mo</span>
                  </p>
                  <ul className="mt-4 space-y-2 text-sm text-slate-600">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <span className={p.popular ? "text-accent-500" : "text-brand-600"}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/login" className={`mt-6 ${p.popular ? "btn-accent" : "btn-secondary"}`}>Get started</Link>
                </Reveal>
              ))}
            </div>
            <Reveal delay={120} className="mx-auto mt-6 max-w-sm text-center">
              <p className="text-sm text-slate-600">
                About what you&apos;d spend on <span className="font-semibold text-slate-900">a few coffees a week</span> — versus{" "}
                <span className="font-semibold text-slate-900">$3,000+/mo</span> for a front-desk hire who still clocks out at 5.
              </p>
              <p className="mt-2 text-sm font-medium text-brand-700">30-day money-back guarantee — cancel anytime.</p>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <Eyebrow>Questions</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold text-slate-900 sm:text-4xl">Good to know</h2>
            </Reveal>
            <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {faqs.map((f, i) => (
                <Reveal key={f.q} delay={i * 70} className="border-l-2 border-accent-200 pl-4">
                  <h3 className="text-base font-semibold text-slate-900">{f.q}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{f.a}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-slate-200">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal className="relative overflow-hidden rounded-3xl bg-slate-900 p-10 sm:p-14">
              <div className="mesh pointer-events-none absolute inset-0 opacity-90" />
              <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Ready to stop missing calls?</h2>
                  <p className="mt-2 text-slate-300">Set up your receptionist in about 10 minutes — live the same day.</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-3">
                  <Link href="/login" className="btn-accent px-5 py-3 text-base">Set up my receptionist</Link>
                  <ScrollLink href="#demo" className="btn border border-white/20 bg-white/10 px-5 py-3 text-base text-white hover:bg-white/20">Try the demo</ScrollLink>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-10 text-sm text-slate-500 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 font-display font-bold text-slate-700">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-xs text-white">S</span>
            Switchboard
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/terms" className="hover:text-slate-800">Terms</Link>
            <Link href="/privacy" className="hover:text-slate-800">Privacy</Link>
            <span>© {new Date().getFullYear()} Switchboard</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
