import Link from "next/link";

// The proof band that sits directly after the hero — where a logo wall goes on
// a site with customers.
//
// We have no customers yet, and faking it (stock logos, "trusted by 100+
// businesses", invented testimonials) is worse than an empty space: this is a
// trust purchase, and one manufactured claim discounts everything else on the
// page. So this band carries only claims a visitor can verify in 30 seconds.
//
// SWAP PLAN — when there's real proof, replace in this order, no redesign needed:
//   1. First paying shop  -> swap "Built and supported locally" for a named
//      customer quote (get permission as part of the pilot deal).
//   2. After ~30 days     -> swap "Hear it first" for the case-study numbers the
//      weekly digest already computes (calls answered / jobs booked / captured).
//   3. Three or more logos-> replace the whole band with a logo wall and move
//      these signals down beside the pricing card.

// The public auto-repair demo line. The number lives in Twilio (friendly name
// sb_demo_auto, routed via the Retell SIP trunk); Retell binds it to an agent
// through the phone number's `inbound_agents` array — note `inbound_agent_id`
// is deprecated and now rejected.
//
// It points at the Riverside Auto Care demo shop's agent, so a prospect calling
// this number exercises the real product: the call lands in a real dashboard
// with real booking. That agent is deliberately NOT a stock demo agent, and two
// things are true of it on purpose:
//   * transfer_to_human is removed — this is a public number, and the transfer
//     target was a real personal phone.
//   * the greeting says "a live demo of Switchboard" so a caller who dials
//     without reading this page is not misled about reaching a real shop.
// Re-provisioning the agent from shop config would restore the transfer tool
// (lib/integrations/retell.ts builds it from config.transferNumber) — check
// that before publishing changes to this shop.
const DEMO_LINE = "+17608005628";
const DEMO_LINE_DISPLAY = "(760) 800-5628";

export function TrustBand() {
  return (
    <section className="border-y border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <p className="text-center text-[15px] leading-7 text-slate-600">
          Switchboard is new — so instead of asking you to take our word for it,
          <span className="font-semibold text-slate-900"> everything here is something you can check yourself.</span>
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {/* 1 — the strongest proof we have: it's callable right now */}
          <div className="rounded-2xl border border-accent-200 bg-accent-50/50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-700">Hear it first</p>
            <a
              href={`tel:${DEMO_LINE}`}
              className="mt-2 inline-block font-display text-2xl font-extrabold tracking-tight text-slate-900 hover:text-accent-700"
            >
              {DEMO_LINE_DISPLAY}
            </a>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              A real line that answers as a demo auto shop. Ask it for a quote, try to book a job — see how it handles
              you before you decide anything.
            </p>
          </div>

          {/* 2 — a face, which the national self-serve competitors can't offer */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Built locally</p>
            <p className="mt-2 font-display text-2xl font-extrabold tracking-tight text-slate-900">Vista, CA</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Built and supported by one person here in North County — not an overseas call center. If something&apos;s
              wrong, you talk to whoever built it.
            </p>
          </div>

          {/* 3 — risk reversal, and transparent pricing in a quote-only category */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Nothing to lose</p>
            <p className="mt-2 font-display text-2xl font-extrabold tracking-tight text-slate-900">30-day refund</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              $149/mo, published right on the page. No setup fee, no contract, cancel from your dashboard any time.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Rather see the price math first?{" "}
          <Link href="#pricing" className="font-medium text-brand-600 underline underline-offset-2">
            Run your own numbers
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
