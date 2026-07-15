# Switchboard — Pilot Outreach Pack

*Everything you need to land the first 3–5 paying shops in one metro. Scripts are
starting points — say them in your own voice. The math is deliberately
conservative so a skeptical owner can't smell inflation.*

---

## The one-liner

> "I set up an AI receptionist that answers your phone 24/7, books jobs, and texts
> you the emergencies — for $149 a month. Want to hear it answer, right now?"

Against national self-serve brands you offer **a local face you can call**. Against
local agencies you offer **a real product at half their price with no $1,000 setup
fee**. Against doing nothing you offer **the missed-call math** below.

**Who to target first:** 1–5 person shops **not** running Jobber / Housecall Pro /
ServiceTitan (most still run on paper + Google Calendar). Lead with **auto repair,
detailing, and cleaning** — no field-service platform bundles an AI receptionist
for them, and the premium vendors ignore them.

---

## The pitch math (defensible)

```
Reality:      ~62% of calls to small businesses go unanswered live (411 Locals)
Conservative: 2 missed calls/day × 30% that would book × avg ticket × 25 workdays
```

| Trade | Avg ticket | Walked revenue/mo (2 missed/day) | vs. $149 |
|-------|-----------|----------------------------------|----------|
| Auto repair | $420 | **~$6,300** | ~42× |
| Auto detailing | $300 | ~$4,500 | ~30× |
| HVAC | $480 | ~$7,200 | ~48× |
| Home services | $380 | ~$5,700 | ~38× |
| Cleaning | $180 | ~$2,700 | ~18× |

Even the *lowest* line pays for Switchboard ~18× over. Point owners at the live
calculator on the pricing page and let them set their own numbers — it's more
convincing than any claim you make.

> Skip the recycled "$126K/year, 85% never call back" stats — provenance is
> untraceable and it reads as inflated. The conservative case is already
> overwhelming.

---

## Cold-call script (to a shop)

**Opener (owner answers):**
> "Hey, this is [name] — I'm local, I build AI phone receptionists for [trade]
> shops here in [metro]. Quick one: when you're under a car / on a job, who's
> answering the phone? … Right. I've got a number you can call right now and hear
> exactly what would answer for you — takes 30 seconds. Want it?"

Give the demo number. Let them call it while you're on the line. Then:
> "That just booked an appointment without you lifting a finger. It's $149 a month,
> you keep your current number, and I set the whole thing up. Want me to stand
> yours up this week?"

**The non-answer IS the pitch.** ~62% won't pick up — leave this voicemail:

> "Hi, this is [name] — I just called and, like a lot of shops, nobody picked up.
> That's exactly the problem I fix. Call this number: [demo line]. It's an AI
> receptionist answering as a [trade] shop — hear what your callers *should* be
> getting. $149 a month, I set it up. Talk soon."

*Practitioner benchmark: demos close 35–50% vs 5–10% for pitch-only calls. Call
early morning or evening; ~93% of connects happen by the 3rd attempt.*

---

## Postcard (200-shop drop, ~$0.40 each)

> **Front:** "Your shop missed 3 calls yesterday."
> **Back:** "Every missed call is a job that went to the next shop. Call this
> number and hear the AI receptionist that answers 24/7, books the job, and texts
> you the emergencies — [demo line]. $149/mo. No new phone. Set up same day.
> — [name], local. [your number]"

ANA benchmark: 2–5.7% response for postcards. The "call this number and hear it"
combination is untested in this category — you'd own it.

---

## Objection handling

| They say | You say |
|----------|---------|
| "What if it can't handle a call?" | "It hands off to your cell mid-call — it even tells you who's calling and why before it connects them. And it always takes a message if you can't pick up." *(This is now true — warm transfer is live.)* |
| "Customers hate robots." | "It says it's an assistant up front, and it only books and takes messages — it never bluffs a price or a diagnosis. Most callers just want a fast answer and an appointment." |
| "I already miss calls, I'll just call back." | "Sure — but 6 in 10 of those callers already dialed the next shop before you got back. This catches them in the moment." |
| "$149 is a lot." | "It's a few coffees a week, versus $3,000+ for a front-desk hire who clocks out at 5. One saved job a month more than covers it — and there's a 30-day money-back guarantee." |
| "I'm not techy." | "You answer a few questions about your shop, hear it, and go live the same day. I'll do the setup with you." |

---

## Referral partners (cheapest CAC in this market)

Bookkeepers, insurance agents, and marketing agencies each touch dozens of local
shops. Offer **20% recurring** (~$30/mo per referred shop; market standard is
20–30% or 1–2 months' bounty). One bookkeeper serving 40 shops is a channel.
Recruit them in the same Chamber / BNI room as your prospects.

> "You work with a lot of local shops. If you send them my way and they sign up,
> I'll pay you 20% every month they stay — for doing nothing but the intro."

---

## Demo lines — runbook (do this first; costs a little)

A printed, always-on phone number that answers as a demo shop turns every cold
call, voicemail, and postcard into a product experience. The demo **agents**
already exist (`scripts/provision-demo-agents.mjs`, used by the landing web-call).
A phone-callable demo line = a Twilio number bound to one of those agents.

**Cost:** ~$1–2/number/month (Twilio) + per-minute call cost. Three numbers
(auto / HVAC / cleaning) is a few dollars a month — trivial vs. one closed shop.

**Steps (you run these — they spend money, so they're not automated):**
1. Confirm demo agents exist: the landing page shows the in-browser demo, which
   means `DEMO_AGENT_AUTO`, `DEMO_AGENT_HVAC`, etc. are already set in prod env.
2. Buy a local Twilio number per vertical (Twilio console or CLI) in your metro's
   area code.
3. Bind each number to its demo agent via the same SIP-trunk + Retell import path
   the app uses for real shops (`attachNumberToTrunk` + `importPhoneNumber` in
   `lib/integrations`) — or point the Twilio number's voice webhook at the demo
   agent. Ask me to add a `scripts/provision-demo-lines.mjs` that does this in one
   command and I'll wire it (it just needs your go-ahead to spend on the numbers).
4. Print the numbers on cards/postcards and read them out on calls.

---

## 90-day sequence (one metro, one vertical at a time — start auto)

- **Weeks 1–2 — assets:** stand up the 3 demo lines; join the Chamber + one BNI
  chapter; print 200 postcards. *(The ROI calculator, pricing, and digest are
  already live on the site.)*
- **Weeks 3–8 — outreach:** 20 cold calls/day into **auto repair only** (owners
  answer, no FSM competes); voicemail-with-demo-number on every non-answer; drop
  the 200 postcards; walk into 5 auto shops/week at ~2pm. **Goal: 10 live demos →
  3–5 paying shops** (these are also your Gate E pilots).
- **Weeks 9–12 — compound:** turn the first shop's real digest numbers into a case
  study; recruit 3 referral partners at 20%; ask every live customer for one
  referral.

**Churn defense from day one** — you already ship all three: the weekly ROI digest
(shows captured $), warm transfer (emergencies reach a human), and the QA gate
(the agent never bluffs a price). Documented killers of local AI-receptionist
deployments are *wrong answers* and *invisible value*; you've addressed both.

---

*Sources for the numbers: 411 Locals call-answer study; ANA direct-mail response
report; per-vertical average tickets from `lib/verticals.ts`; practitioner
close/answer rates are directional (agency blogs, Indie Hackers). Re-verify any
competitor claim before putting it in print — this market moves monthly.*
