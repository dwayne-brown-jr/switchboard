import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

export const metadata = { title: "Terms of Service — Switchboard" };

function LegalShell({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2 font-display font-bold text-slate-900">
            <Logo className="h-8 w-8" />
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
            <Link href="/sms-opt-in" className="hover:text-slate-800">Text alerts</Link>
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
        These terms are a binding agreement between you (the business owner or an authorized representative of the
        business) and Switchboard, an AI phone receptionist service for local businesses. By creating an account or using
        the service, you agree to them. If you don&apos;t agree, don&apos;t use the service. You must be at least 18 and
        have authority to bind the business you sign up.
      </p>

      <h2>The service</h2>
      <p>
        Switchboard provisions and operates an automated, AI-powered phone assistant that answers calls to a number we
        assign you, answers questions from the information you provide, books appointments, records and/or transcribes
        calls, and alerts you about bookings and urgent calls by push, email, and (if you opt in) text. You are
        responsible for the accuracy of the business information, prices, hours, and rules you enter, and for reviewing
        what the assistant does on your behalf.
      </p>

      <h2>Not for emergencies</h2>
      <p>
        Switchboard is not an emergency service. It cannot dispatch police, fire, or medical help. Callers with a
        life-threatening emergency should hang up and dial 911. You agree to configure your receptionist consistent with
        this and not to represent it as an emergency line.
      </p>

      <h2>AI limitations &amp; disclosure</h2>
      <p>
        The assistant is automated and can make mistakes, mishear, or misunderstand. It gives price ranges and general
        information only and does not form binding quotes or contracts on your behalf. You are responsible for reviewing
        bookings and following up with callers as needed. You authorize Switchboard to answer your calls with an
        automated AI assistant, and you agree not to configure or represent it in a way that conceals that callers are
        interacting with an automated assistant where the law requires that disclosure (for example, certain
        &quot;bot disclosure&quot; laws). We enable the assistant to identify itself as a virtual assistant; you agree
        not to disable that where it is legally required.
      </p>

      <h2>Call recording &amp; caller consent</h2>
      <p>
        Calls to your Switchboard number may be recorded and/or transcribed to provide the service. Recording laws vary
        by state and some require the consent of <strong>all</strong> parties to the call. <strong>Because you determine
        the purpose of your calls and are a party to them, you — not Switchboard — are responsible for providing any
        legally required recording notice or consent to your callers.</strong> We give you the tools to do this,
        including an automatic spoken disclosure at the start of each call, which we recommend you keep enabled. You
        represent that your use of recording and transcription complies with all applicable federal, state, and local
        laws, and you accept responsibility for that compliance.
      </p>

      <h2>Your responsibilities</h2>
      <p>
        You must have the authority to forward your business calls to the service, comply with all laws that apply to
        your calls and texts (including call-recording consent, AI-disclosure, and messaging-consent laws — see our{" "}
        <Link href="/privacy">Privacy Policy</Link>), and use the service only for a lawful business you operate. You are
        responsible for obtaining any consents your callers&apos; and customers&apos; data requires, for the content and
        legality of the information you enter, and for keeping your account credentials secure. You may not use the
        service to harass, defraud, or send unlawful, deceptive, or unsolicited messages.
      </p>

      <h2>Acceptable use</h2>
      <p>
        You agree not to: use the service for any unlawful, fraudulent, or deceptive purpose; use it for debt
        collection, telemarketing, political, or other campaigns it isn&apos;t designed for; upload content you have no
        right to use; attempt to break, overload, reverse-engineer, or circumvent the security or usage limits of the
        service; resell or provide the service to third parties without our written permission; or use it in a way that
        could cause us or our providers to violate telephony, messaging, or privacy rules. We may suspend service to
        stop active harm or a suspected violation.
      </p>

      <h2>Data roles &amp; your callers&apos; information</h2>
      <p>
        For your <strong>account and business configuration</strong> data, Switchboard acts as the controller. For the
        <strong> personal information of your callers</strong> (such as phone numbers, recordings, and transcripts), you
        are the controller and <strong>Switchboard acts as your processor / service provider</strong>, handling that
        data on your documented instructions solely to provide the service. We do not sell caller data or use it for our
        own marketing. Our handling of that data — including security, sub-processors, and deletion — is described in the
        <Link href="/privacy"> Privacy Policy</Link>, which is incorporated into these terms, and may be supplemented by a
        data processing addendum where one applies to you.
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
        The service relies on third parties (telephony, voice, calendar, payments, AI, email, hosting). Their
        availability affects ours, and your use is also subject to their terms. We aren&apos;t responsible for outages or
        actions of those providers. We use commercially reasonable efforts to keep the service available but do not
        guarantee uninterrupted or error-free operation.
      </p>

      <h2>Intellectual property</h2>
      <p>
        Switchboard and its software, designs, and content are owned by us and our licensors. We grant you a limited,
        non-exclusive, non-transferable right to use the service while your account is in good standing. You keep
        ownership of the business information and content you provide, and you grant us the license needed to host,
        process, and use it to operate the service for you. You may not copy, modify, or create derivative works of the
        service except as allowed by law.
      </p>

      <h2>Your indemnity</h2>
      <p>
        Because you control the purpose and content of your calls and texts, you agree to defend, indemnify, and hold
        harmless Switchboard and its operator from claims, damages, penalties, and costs (including reasonable
        attorneys&apos; fees) arising from: your calls or messages; your failure to give any required recording,
        AI-disclosure, or messaging consent or notice; the information you enter; your violation of these terms or of any
        law; or your infringement of another&apos;s rights. We will notify you of the claim and may participate in the
        defense with our own counsel.
      </p>

      <h2>Disclaimers &amp; liability</h2>
      <p>
        The service is provided <strong>&quot;as is&quot;</strong> and <strong>&quot;as available,&quot;</strong>{" "}
        without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose,
        and non-infringement. We do not warrant that the assistant will answer every call, book every appointment
        correctly, or never make a mistake. <strong>To the maximum extent permitted by law, our total liability for any
        and all claims is limited to the amount you paid us in the three months before the claim, and we are not liable
        for indirect, incidental, special, or consequential damages, or for lost profits, missed calls, or missed
        bookings.</strong> Some jurisdictions don&apos;t allow certain limitations, so parts of this may not apply to you.
      </p>

      <h2>Suspension &amp; termination</h2>
      <p>
        You may stop using the service and cancel anytime from your billing portal. We may suspend or terminate your
        access if you materially breach these terms, fail to pay, or use the service in a way that risks harm to callers,
        our providers, or the platform; where practical we&apos;ll give notice and a chance to cure. On termination, your
        receptionist stops answering and we may release your assigned number after a short grace period. Sections that by
        their nature should survive (payment owed, IP, indemnity, disclaimers, liability, and dispute terms) survive
        termination.
      </p>

      <h2>Governing law &amp; disputes</h2>
      <p>
        These terms are governed by the laws of the state in which the Switchboard operator is established, without
        regard to its conflict-of-laws rules. Before filing anything, both sides agree to first try to resolve the
        dispute informally by contacting the other in writing and negotiating in good faith for at least 30 days. Any
        unresolved dispute will be brought in the state or federal courts located in that state, and you consent to their
        jurisdiction. <em>(A specific governing state, venue, and any arbitration or class-action-waiver terms should be
        finalized with legal counsel before launch.)</em>
      </p>

      <h2>General</h2>
      <p>
        These terms are the entire agreement between you and us about the service and replace any prior understanding. If
        a provision is unenforceable, the rest still applies. Our not enforcing a right isn&apos;t a waiver of it. You may
        not assign these terms without our consent; we may assign them to a successor of the business. We may update these
        terms; material changes will be noted here with a new date, and continued use means you accept them.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Contact us at the email on your account or at{" "}
        <a href="mailto:support@getswitchboardhq.com">support@getswitchboardhq.com</a>. These terms are a plain-language
        starting point and are being finalized with legal counsel; they may be updated as the service grows.
      </p>
    </LegalShell>
  );
}
