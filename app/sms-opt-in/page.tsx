import Link from "next/link";

export const metadata = {
  title: "Text message program (Switchboard Alerts) — Switchboard",
  description:
    "How business owners opt in to Switchboard Alerts: the exact consent language shown at sign-up, what messages are sent, frequency, rates, and how to stop.",
};

// PUBLIC, un-gated page documenting the SMS opt-in flow.
//
// Exists because the real consent checkbox lives inside the authenticated setup
// flow (/app/go-live), so a carrier reviewing an A2P 10DLC campaign cannot reach
// it — which is what Twilio error 30924 ("missing or non-compliant consent
// agreement language in opt-in flow") fires on. Carriers ask for a public URL or
// screenshot showing consent "as consumers see it"; this is that URL.
//
// The consent block below is a VERBATIM copy of the live checkbox in
// app/app/go-live/walls.tsx. If that wording ever changes, change it here in the
// same commit — a mismatch between registered and actual opt-in is a compliance
// problem, not a cosmetic one.
export default function SmsOptIn() {
  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2 font-display font-bold text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">S</span>
            Switchboard
          </Link>
          <Link href="/" className="btn-ghost">Home</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-600">Text message program</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">Switchboard Alerts</h1>
        <p className="mt-3 text-[15px] leading-7 text-slate-600">
          Switchboard is an AI phone receptionist for local service businesses. When our system answers a call for a
          business and books an appointment or flags an urgent call, it sends an automated text to{" "}
          <strong className="text-slate-900">that business owner</strong> — the person who signed up. We do not text the
          business&apos;s customers, and we never send marketing.
        </p>

        {/* ---- the actual opt-in, reproduced exactly ---- */}
        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold text-slate-900">How owners opt in</h2>
          <p className="mt-2 text-[15px] leading-7 text-slate-600">
            During account setup, at the <strong className="text-slate-900">&ldquo;Turn on texting&rdquo;</strong> step,
            the owner enters their own mobile number and checks the box below. It is{" "}
            <strong className="text-slate-900">unchecked by default</strong>, is{" "}
            <strong className="text-slate-900">not a condition of purchase</strong> (the setup can be completed with
            &ldquo;Skip texting for now&rdquo;), and consent is stored with a timestamp. This is exactly what the owner
            sees:
          </p>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">As shown at sign-up</p>
            {/* markup mirrors app/app/go-live/walls.tsx */}
            <label className="mt-3 flex items-start gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
              <input type="checkbox" className="mt-0.5" disabled aria-label="Example consent checkbox (display only)" />
              <span>
                I agree to receive automated text alerts about my business (new bookings, urgent calls) at my mobile
                number. Message frequency varies; message &amp; data rates may apply. Reply STOP to unsubscribe, HELP for
                help.
              </span>
            </label>
            <p className="mt-3 text-xs text-slate-400">
              Display only — this copy is not interactive. The live checkbox appears inside the owner&apos;s setup flow.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold text-slate-900">What you&apos;ll receive</h2>
          <ul className="mt-2 space-y-1.5 text-[15px] leading-7 text-slate-600">
            <li>• <strong className="text-slate-900">Booking confirmations</strong> — when the receptionist books a job.</li>
            <li>• <strong className="text-slate-900">Urgent-call alerts</strong> — when a caller reports an emergency.</li>
          </ul>
          <p className="mt-4 text-sm font-semibold text-slate-500">Example messages</p>
          <div className="mt-2 space-y-2">
            {[
              "New booking (Brake service) for Jul 21 at 10:00 AM - Vista Auto Works. See details on your Switchboard dashboard. Reply STOP to opt out.",
              "Vista Auto Works: Urgent caller flagged - reports no heat and needs a callback ASAP. Follow up from your dashboard. Reply STOP to opt out.",
            ].map((m) => (
              <p key={m} className="rounded-xl bg-white px-4 py-3 text-sm leading-6 text-slate-700 ring-1 ring-slate-200">
                {m}
              </p>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold text-slate-900">Frequency, rates, and how to stop</h2>
          <ul className="mt-2 space-y-1.5 text-[15px] leading-7 text-slate-600">
            <li>• <strong className="text-slate-900">Frequency:</strong> varies — it depends on how many calls the business receives.</li>
            <li>• <strong className="text-slate-900">Cost:</strong> message &amp; data rates may apply.</li>
            <li>• <strong className="text-slate-900">Stop:</strong> reply <strong className="text-slate-900">STOP</strong> to any message to unsubscribe, or turn texting off from your dashboard.</li>
            <li>• <strong className="text-slate-900">Help:</strong> reply <strong className="text-slate-900">HELP</strong>, or email{" "}
              <a className="text-brand-600 underline" href="mailto:support@getswitchboardhq.com">support@getswitchboardhq.com</a>.
            </li>
            <li>• <strong className="text-slate-900">Resubscribe:</strong> reply <strong className="text-slate-900">START</strong>.</li>
          </ul>
          <p className="mt-4 text-[15px] leading-7 text-slate-600">
            Carriers are not liable for delayed or undelivered messages. We do not share your mobile number or your SMS
            consent with third parties or affiliates for their own marketing.
          </p>
        </section>

        <p className="mt-10 text-sm text-slate-500">
          Full details in our <Link href="/terms" className="text-brand-600 underline">Terms of Service</Link> and{" "}
          <Link href="/privacy" className="text-brand-600 underline">Privacy Policy</Link>.
        </p>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-8 text-sm text-slate-500">
          <span>© {new Date().getFullYear()} Switchboard</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-slate-800">Terms</Link>
            <Link href="/privacy" className="hover:text-slate-800">Privacy</Link>
            <Link href="/sms-opt-in" className="hover:text-slate-800">Text alerts</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
