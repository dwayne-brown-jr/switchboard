# Switchboard — Legal Review Memo (DRAFT)

> **⚠️ THIS IS NOT LEGAL ADVICE.** This memo is a *mock* attorney-style review written to
> surface the legal issues that matter for a business like Switchboard and to give a real,
> licensed attorney a running start. It is a checklist and a drafting aid — **not** a substitute
> for counsel licensed in your jurisdiction. Do not launch relying solely on this document.
> Every item marked **[FILL]** is a business/legal decision only you and your attorney can make.

- **Prepared:** July 2026
- **Re:** Terms of Service (`/terms`) and Privacy Policy (`/privacy`) for Switchboard
- **Product:** AI phone receptionist SaaS for local service businesses (HVAC, plumbing,
  auto, salon, etc.). Answers inbound calls with a voice AI, books appointments, records/
  transcribes calls, and sends SMS/email alerts to the business owner.
- **Operator:** Sole proprietor (no EIN on file). **This materially affects liability — see §H-7.**

---

## 1. Why this business is legally distinctive

Switchboard sits on top of three heavily-regulated activities at once:

1. **Recording phone calls** with third parties (the *callers*, who never signed up for anything).
2. **Automated / AI voice interaction** with consumers who may not know they are talking to a bot.
3. **Automated business text messaging** (A2P) to the owner's mobile.

Each is governed by a different body of law, in every state, and the riskiest exposure is not
to *your customer* (the business owner) — it's to **the third-party callers**, who are not party
to your contract and whose consent you never directly obtain. Your Terms must therefore push the
call-level compliance duty onto the business owner (who *is* the party to the call), and your
Privacy Policy must correctly cast Switchboard as a **service provider / processor** of that
caller data rather than a controller.

---

## 2. Risk register

Severity reflects likelihood × cost of getting it wrong for a US, single-operator SaaS.

| # | Issue | Severity | Status in current docs |
|---|-------|----------|------------------------|
| H-1 | Two-party / all-party call-recording consent | **HIGH** | Addressed; allocation + disclosure covered, timing needs QA |
| H-2 | TCPA + A2P 10DLC messaging consent | **HIGH** | Addressed; opt-in is unchecked-by-default, STOP/HELP present |
| H-3 | AI/bot disclosure laws (CA B.O.T. Act, UT AI Policy Act) | **HIGH** | Partially addressed; see recommendation |
| H-4 | Data-processing role + DPA for caller PII | **HIGH** | Now addressed in Terms §"Data roles"; standalone DPA still [FILL] |
| M-5 | Biometric privacy (IL BIPA, TX CUBI, WA) — voiceprints | **MED** | Now addressed (we state no voiceprints); verify vendor behavior |
| M-6 | Limitation of liability enforceability | **MED** | Present; cap tied to 3-mo fees |
| M-7 | Sole-proprietor personal liability | **MED** | Structural — see §H-7 recommendation |
| M-8 | Governing law / venue / dispute resolution | **MED** | Generic; must name a state + venue [FILL] |
| M-9 | CCPA/CPRA "service provider" contract terms + "do not sell" | **MED** | "Do not sell" stated; SPA language should be in DPA [FILL] |
| M-10 | Auto-renewal law (CA ARL, similar) disclosures | **MED** | Cancel-anytime stated; add pre-charge acknowledgment [FILL] |
| M-11 | State comprehensive privacy laws (VA/CO/CT/TX/OR/MT…) | **MED** | Rights section added; processor duties in DPA [FILL] |
| L-12 | Emergency / 911 limitation | LOW | Well covered |
| L-13 | Accessibility (ADA Title III / WCAG) of the web app | LOW | Not addressed |
| L-14 | Trademark clearance for the name "Switchboard" | LOW | Out of scope of docs; clear before spend |
| L-15 | Breach-notification obligations | LOW | Add to security program; note in Privacy |

---

## 3. Issue detail & recommendations

### H-1 — Call recording consent (the single biggest exposure)
Federal law (18 U.S.C. §2511) is one-party consent, but **~11–12 states require all-party
consent** (CA, FL, IL, MD, MA, MT, NH, OR (in-person), PA, WA, and others by case law). Because
callers can be anywhere, you must design to the **strictest** standard.

- The AI already gives a spoken recording disclosure in its first sentence (`lib/templates/*`).
  Keep it **first**, before any substantive exchange, and log that it played.
- Terms correctly place the duty on the owner (they determine the call's purpose and are a party
  to it). Keep that allocation and back it with an **indemnity** (added).
- **Recommendation:** (a) make the disclosure non-removable from the greeting for owners in
  all-party states, or globally; (b) retain proof (transcript line) that it played; (c) let owners
  disable recording (not just transcription) if their counsel advises.

### H-2 — TCPA / A2P messaging
- Consent box is **unchecked by default** and **not a condition of purchase** — correct.
- STOP/HELP handled by the compliance webhook; keep opt-out records indefinitely.
- Alerts are **transactional** (booking/emergency), which is the right framing — **never** send
  marketing over that consent. Terms and Privacy both say no marketing sharing. Keep it that way.
- **Recommendation:** store the consent artifact (timestamp, IP, the exact checkbox text shown) —
  the `smsConsentAt` column exists; make sure the *wording shown* is versioned so you can prove
  what the owner agreed to.

### H-3 — AI / bot disclosure
- **California B.O.T. Act (Cal. B&P §17940–43):** unlawful to use a bot to *incentivize a sale or
  influence a vote* without disclosure. A receptionist that books paid jobs plausibly touches
  "sale." **Utah AI Policy Act (2024)** requires disclosure that a consumer is dealing with AI
  **on request**, and proactively for regulated occupations.
- **Recommendation:** have the AI identify itself as a **virtual/AI assistant** in its greeting
  (a light touch — "Hi, I'm the virtual assistant for Ace Plumbing"). This is cheap insurance and
  should be a **default that owners cannot silently turn off**. Add a one-liner to Terms that the
  owner authorizes AI answering and won't represent it as a live human where prohibited. *(Terms
  updated to cover the authorization; greeting change is a product task, tracked separately.)*

### H-4 — Data roles & DPA
- For **caller** personal data (numbers, recordings, transcripts), the **business owner is the
  controller** and **Switchboard is the processor / service provider** acting on documented
  instructions. For **owner account data**, Switchboard is the controller.
- Terms now state this allocation. **You still need a standalone Data Processing Addendum (DPA)**
  incorporated by reference, with: processing scope, security measures, subprocessor list + change
  notice, breach notice timeline, deletion/return on termination, and CCPA "service provider"
  restrictions (no use of caller data for your own purposes, no "sale"/"share").
- **[FILL]:** publish a subprocessor list (Twilio, Retell, Anthropic, Stripe, Cal.com, Resend,
  Vercel, Upstash, Turso) at a stable URL and reference it from the DPA.

### M-5 — Biometric
- IL **BIPA** is the landmine (statutory damages, private right of action). It bites if you create
  a **voiceprint / voice biometric identifier**. Ordinary recording/transcription is *not* a
  biometric identifier. Privacy Policy now states you **do not create or store voiceprints**.
- **Recommendation:** confirm the voice vendor (Retell) is not enabling voice-ID features; if it
  ever is, you need separate BIPA notice + written consent.

### M-6 / M-7 — Liability & entity
- The 3-month fee cap and consequential-damages waiver are standard and worth keeping, but caps
  are most defensible when **conspicuous** (they are — bolded) and paired with the risk allocation
  above.
- **Sole proprietor = unlimited personal liability.** A single bad recording-consent class action
  reaches personal assets. **Strong recommendation, outside the docs:** form an **LLC** and get
  **tech E&O + general liability + cyber** insurance before onboarding paying customers. This is
  the highest-leverage legal step you can take and no contract clause substitutes for it.

### M-8 — Governing law / disputes
- Docs use generic "the state where Switchboard is established." **[FILL]** a specific state, a
  specific county/court for venue, and decide **arbitration + class-action waiver** yes/no (common
  for consumer SaaS, but has its own disclosure rules). Add a **30-day informal resolution** step
  first (drafted in).

### M-10 — Auto-renewal
- CA **ARL** and siblings (e.g., NY, VA) require clear recurring-charge disclosure, affirmative
  consent, and an easy online cancel. You have cancel-anytime via Stripe portal (good). **[FILL]:**
  show the "$149/mo, renews monthly until cancelled" language at the point of purchase and capture
  an acknowledgment.

### L-13 / L-14 / L-15
- **Accessibility:** run the marketing + app pages against WCAG 2.1 AA; ADA Title III web claims
  are a growing troll vector.
- **Name clearance:** "Switchboard" is descriptive/crowded — do a USPTO + common-law search before
  investing in the brand.
- **Breach notice:** all 50 states have breach-notification statutes; add a written incident plan
  and reflect the commitment in the Privacy Policy security section.

---

## 4. Placeholders to resolve before relying on these documents  **[FILL]**

- [ ] Legal entity name + structure (recommend LLC) and the operator's **home state**.
- [ ] Governing-law state + venue county/court; arbitration yes/no + class-waiver.
- [ ] A real **support / legal contact address** (physical address is required for CAN-SPAM and
      several state privacy laws) and a dedicated privacy email.
- [ ] Standalone **DPA** + public **subprocessor list** URL.
- [ ] Point-of-sale **auto-renewal** disclosure + acknowledgment capture.
- [ ] Insurance (E&O / cyber / GL) bound before first paying customer.
- [ ] Confirm the AI greeting includes both the **recording disclosure** and an **AI-assistant
      identification**, non-disableable in all-party / regulated contexts.
- [ ] Data-retention **periods** (currently "as needed") — pick concrete windows for recordings,
      transcripts, and call metadata.

---

## 5. Bottom line

The updated Terms and Privacy Policy are a **reasonable, business-specific starting draft** that
correctly identifies the three high-risk vectors (recording, AI disclosure, messaging) and places
call-level compliance on the owner where it belongs. They are **not launch-final**: the DPA,
governing-law specifics, auto-renewal capture, and — most importantly — **entity formation and
insurance** are decisions a licensed attorney and you must close before onboarding paying
customers. Treat everything above as a work plan for that conversation.

*— Mock review, generated as a drafting aid. Have a licensed attorney in your jurisdiction review
and finalize before publication.*
