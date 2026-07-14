import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = { title: "Terms of Service — Switchboard" };

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
        <div className="mt-8 space-y-6 text-[15px] leading-7 text-slate-600 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_a]:text-brand-600 [&_a]:underline">
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

export default function Terms() {
  return (
    <LegalShell title="Terms of Service" updated="July 2026">
      <p>
        These terms govern your use of Switchboard, an AI phone receptionist service for local businesses. By creating an
        account or using the service, you agree to them. If you don&apos;t agree, don&apos;t use the service.
      </p>

      <h2>The service</h2>
      <p>
        Switchboard provisions and operates an automated phone assistant that answers calls, answers questions from the
        information you provide, books appointments on your connected calendar, and alerts you about urgent calls. You are
        responsible for the accuracy of the business information, prices, hours, and rules you enter.
      </p>

      <h2>Not for emergencies</h2>
      <p>
        Switchboard is not an emergency service. It cannot dispatch police, fire, or medical help. Callers with a
        life-threatening emergency should hang up and dial 911. You agree to configure your receptionist consistent with
        this and not to represent it as an emergency line.
      </p>

      <h2>AI limitations</h2>
      <p>
        The assistant is automated and can make mistakes, mishear, or misunderstand. It gives price ranges and general
        information only and does not form binding quotes or contracts on your behalf. You are responsible for reviewing
        bookings and following up with callers as needed.
      </p>

      <h2>Your responsibilities</h2>
      <p>
        You must have the authority to forward your business calls to the service, comply with all laws that apply to your
        calls and texts (including call-recording consent and messaging-consent laws — see our <Link href="/privacy">Privacy Policy</Link>),
        and use the service only for a lawful business you operate. You may not use it to harass, defraud, or send unlawful
        or unsolicited messages.
      </p>

      <h2>Text messaging (SMS)</h2>
      <p>
        If you opt in, Switchboard sends you automated text alerts about your own business calls — <strong>booking
        confirmations</strong> and <strong>emergency-call alerts</strong> — at the mobile number you provide (the
        &quot;Switchboard Alerts&quot; program). You opt in during account setup by checking the SMS consent box; consent
        is not a condition of purchase, and the box is unchecked by default.
      </p>
      <p>
        Message frequency varies and depends on your call volume. <strong>Message and data rates may apply.</strong> Reply{" "}
        <strong>STOP</strong> at any time to unsubscribe, or <strong>HELP</strong> for help; you can also manage texting from
        your dashboard. For support, contact <a href="mailto:support@getswitchboardhq.com">support@getswitchboardhq.com</a>.
        Mobile carriers are not liable for delayed or undelivered messages. We do not share your mobile number or SMS consent
        with third parties or affiliates for their own marketing.
      </p>

      <h2>Billing</h2>
      <p>
        Paid plans are billed monthly in advance through Stripe. You can cancel anytime from the billing portal in your
        dashboard; cancellation stops future charges and your receptionist stops answering at the end of the flow. Fees
        already paid are non-refundable except where required by law. If a payment fails, we may suspend the service after
        notifying you.
      </p>

      <h2>Third-party services</h2>
      <p>
        The service relies on third parties (telephony, voice, calendar, payments). Their availability affects ours, and
        your use is also subject to their terms. We aren&apos;t responsible for outages or actions of those providers.
      </p>

      <h2>Disclaimers &amp; liability</h2>
      <p>
        The service is provided &quot;as is,&quot; without warranties. To the maximum extent permitted by law, our total
        liability for any claim is limited to the amount you paid us in the three months before the claim, and we are not
        liable for lost profits, missed calls, or missed bookings.
      </p>

      <h2>Changes &amp; contact</h2>
      <p>
        We may update these terms; material changes will be noted here with a new date. Questions? Contact us at the email
        on your account. These terms are a plain-language starting point and may be updated as the service grows.
      </p>
    </LegalShell>
  );
}
