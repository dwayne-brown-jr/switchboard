import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = { title: "Privacy Policy — Switchboard" };

function LegalShell({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2 font-display font-bold text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">S</span>
            Switchboard
          </Link>
          <Link href="/" className="btn-ghost">Home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="font-display text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-400">Last updated {updated}</p>
        <div className="mt-8 space-y-6 text-[15px] leading-7 text-slate-600 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_a]:text-brand-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
          {children}
        </div>
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-8 text-sm text-slate-500">
          <span>© {new Date().getFullYear()} Switchboard</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-slate-800">Terms</Link>
            <Link href="/privacy" className="hover:text-slate-800">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function Privacy() {
  return (
    <LegalShell title="Privacy Policy" updated="July 2026">
      <p>
        This policy explains what information Switchboard collects, how we use it, and the choices you have. It covers both
        business owners who use Switchboard and the callers who reach a Switchboard receptionist.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> your name, email, and sign-in identity.</li>
        <li><strong>Business configuration:</strong> your business name, location, hours, services, prices, FAQs, and alert numbers.</li>
        <li><strong>Call data:</strong> for calls handled by your receptionist — caller phone number, time, duration, what the call was about, the outcome (e.g. booked, message, emergency), and, where available, a call recording and/or transcript.</li>
        <li><strong>Billing:</strong> handled by Stripe; we store your plan and subscription status, not your full card number.</li>
        <li><strong>Usage &amp; technical data</strong> needed to operate and secure the service.</li>
      </ul>

      <h2>Call recording &amp; consent</h2>
      <p>
        Calls to your Switchboard number may be recorded and/or transcribed to provide the service (booking, quality, and
        your call history). Recording laws vary by state — some require all parties to consent. <strong>As the business
        owner, you are responsible for providing any legally required notice or consent to your callers</strong> (for
        example, a spoken &quot;this call may be recorded&quot; disclosure, which your receptionist can be configured to
        give). We provide the tools; you are the party that determines the purpose of the calls.
      </p>

      <h2>Text messages (SMS)</h2>
      <p>
        If you opt in, Switchboard sends you automated text alerts about your business calls (booking confirmations and
        emergency-call alerts) at the mobile number you provide. Message frequency varies; message and data rates may
        apply. Reply <strong>STOP</strong> to unsubscribe or <strong>HELP</strong> for help. <strong>We do not share your
        mobile number or SMS opt-in consent with any third parties or affiliates for their own marketing purposes.</strong>{" "}
        Business texting is subject to carrier registration (A2P 10DLC) and applicable consent laws.
      </p>

      <h2>How we use information</h2>
      <ul>
        <li>To operate your receptionist — answer calls, book appointments, and alert you.</li>
        <li>To show you your dashboard, analytics, and weekly summary (which you can unsubscribe from).</li>
        <li>To provide support, prevent abuse, and keep the service secure.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        We use trusted service providers to run the platform, and share only what each needs: telephony &amp; messaging
        (Twilio), voice AI (Retell), scheduling (Cal.com), payments (Stripe), language AI for configuration and quality
        (Anthropic), email (Resend), and infrastructure (Vercel, Upstash, Turso). We do not sell your personal information.
      </p>

      <h2>Retention</h2>
      <p>
        We keep account and call data for as long as your account is active and as needed to provide the service. You can
        request deletion of your account and associated data by contacting us; some records may be retained where required
        by law.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Unsubscribe from the weekly summary via the link in that email.</li>
        <li>Request access to, correction of, or deletion of your data by contacting us.</li>
        <li>Cancel your subscription anytime from the billing portal.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions about privacy? Contact us at the email on your account. This is a plain-language policy and may be updated
        as the service grows; material changes will be noted here with a new date.
      </p>
    </LegalShell>
  );
}
