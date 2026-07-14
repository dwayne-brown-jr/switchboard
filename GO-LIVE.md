# Switchboard — Launch Gate Roadmap

**The question this answers:** what has to be true before a stranger can sign up, pay,
and get a working AI receptionist **with no human intervention** — i.e. before this is a
*true self-serve SaaS* and not an MVP you hand-hold.

**Current verdict (2026-07-12):** Genuine, live-verified MVP. Architecturally a real
multi-tenant SaaS. The core product (answer → book → hand off) works and is proven on a
real call. What remains is **compliance, self-serve reliability, billing integrity,
operational safety, and one real external customer** — a finite list, not a rewrite.

**Progress update (2026-07-13):** The **entire code side of the self-serve gates is done**
(all verified: typecheck + 87 tests + build). Onboarding now self-heals, canceled numbers
are reclaimed, A2P no longer blocks go-live, failures are alerted, a health check watches
for dead voice paths, billing collapsed to one launch plan, past-due dunning + abandonment
nudges ship, and call-recording disclosure is baked into every agent template. What's left
is **external/manual**: A2P 10DLC registration, legal review, one real pilot, and turning on
the alert env vars + creating the 5 QStash cron schedules (all in `SETUP.md`).

Legend — **Owner:** 🤖 = I can do it in-code · 👤 = needs you (business info / accounts) ·
🏛️ = external (carrier / lawyer, has its own clock). ✅ = shipped this pass.

---

## GATE A — Legal & compliance (can't legally take money without this)

Goal: we can lawfully answer, record, and text on behalf of a paying business.

- [ ] 🏛️👤 **A2P 10DLC registration** — Brand + Campaign + Messaging Service in Twilio, attach the shop number. Unblocks ALL owner SMS (booking + emergency). Error 30034 today. *~1–3 wks carrier clock, small fees.*
- [ ] 🤖👤 **In-app A2P submission wired into onboarding** — `lib/a2p.ts` (`submitA2P`/`pollA2P`) exists but was never run to completion; make it part of the signup flow so every new shop registers automatically instead of manually. *Build done; needs your Twilio brand approved first.*
- [x] ✅🤖 **Call-recording disclosure in-agent** — DONE: a spoken "this call may be recorded" is now baked into the first-sentence `DISCLOSURE` block of all 6 templates (two-party-consent safe). *Riverside's already-live agent needs a republish to pick it up; new shops get it automatically. Per-state suppression (skip in one-party states) is a possible later optimization.*
- [ ] 🏛️👤 **Terms & Privacy real review** — pages exist (`app/terms`, `app/privacy`) but are unreviewed boilerplate. Needs a real pass (data handling, call recording, SMS consent language, cancellation).
- [x] ✅🤖 **SMS consent + opt-out** — DONE: inbound-SMS webhook (`/api/webhooks/twilio/sms`, signature-verified) handles STOP/START/HELP; STOP persists `smsOptOut` on the shop and both SMS send paths gate on it via `canSendSms`; the A2P wall now requires an explicit opt-in checkbox (stored as `smsConsentAt`). Numbers get their `SmsUrl` wired at provisioning + re-wired at A2P submit. *Prod DB needs `prisma/prod-migrations/2026-07-13-sms-consent.sql`.*

## GATE B — Self-serve reliability (a stranger onboards unattended)

Goal: someone who isn't you signs up and gets a working number + live agent with zero manual steps.

- [x] ✅🤖 **Onboarding self-heals** — DONE: `onboarding-sweep` cron reconciles subscribe-stalled runs against Stripe (missed webhook), resumes crashed auto-passes, and pages admins on runs stuck >72h. Also fixed a Stripe-webhook dedupe bug that dropped failed events on retry. *(Still worth doing: one real untouched cold-path run — see Gate E.)*
- [x] ✅🤖 **A2P no longer blocks go-live** — DONE: pipeline reordered so finishing forwarding takes the shop live; texting (a2p) became an optional post-live nudge that can never stall onboarding.
- [x] ✅🤖 **Onboarding correctness across verticals** — DONE: cross-vertical sanity suite (`lib/verticals.test.ts`) verifies every advertised vertical has a complete catalog/template/booking-fields set and that service resolution handles realistic caller phrasing per vertical (`lib/match-service.test.ts`); bookings now normalize the caller's free-text service to the shop's catalog name when it clearly matches (ambiguous stays raw — never guesses); the go-live test-call hint is vertical-aware instead of hardcoded "oil change". *Deferred to BACKLOG: per-service durations (all slots are 60 min) + landing-page demo agents for the 3 verticals without one.*
- [x] ✅🤖 **Number reclamation on cancel** — DONE: cancel → `"canceled"` + 30-day grace → daily `reclaim-numbers` cron releases the Twilio number (resubscribe within grace restores it).

## GATE C — Billing integrity (money in = access, money stops = access stops)

Goal: the plan a customer pays for is exactly what they get, and lapses cut off cleanly.

- [x] 🤖 **Payment gates setup** — DONE: `provision.ts` blocks provisioning unless `isPaying(subStatus)`.
- [x] 🤖 **Past-due / canceled sync** — DONE: `billing-sync.ts` handles `past_due`/`unpaid`/`canceled` from Stripe webhooks.
- [x] ✅🤖 **One plan for launch** — DONE (decision): collapsed the 3 cosmetic tiers to a single $149 "Switchboard" plan (everyone already got the full agent). Tiering deferred until there are real customers and a feature worth gating.
- [x] ✅🤖 **Lapse pauses the agent** — DONE: cancellation unbinds the number so the agent stops answering (real enforcement, not just a flag). `past_due` intentionally keeps answering during Stripe's grace window (see dunning).
- [x] ✅🤖 **Dunning UX** — DONE (decision: grace + escalating reminders): in-app "update your card" banner + day-1/3/7 escalating emails via the `reminders` cron. Never pre-pauses; cancel is the only hard stop.

## GATE D — Operational safety (you find out before your customers do)

Goal: when it breaks for a paying shop, you know immediately.

- [x] ✅🤖 **Error monitoring** — DONE: `reportError` fans to the in-app failure feed + Sentry + Slack. *Just set `SENTRY_DSN` / `ALERT_WEBHOOK_URL` to turn on the external sinks.*
- [x] ✅🤖 **Provisioning + webhook alerts** — DONE: wrapped every previously-silent route (Stripe webhook, call-events, notify-owner, forwarding verify, all job crons) so failures reach the alert sinks.
- [x] ✅🤖 **Silent-shop / voice-path health check** — DONE: `health-check` cron pages admins when a live shop that *was* receiving calls goes quiet (`SILENT_SHOP_DAYS`) — the symptom of a broken voice path.
- [ ] 🤖 **Uptime + a status page** — minimal, but customers whose phone lines depend on you will ask. *(Not built — lower priority.)*

## GATE E — Prove it (the only gate that matters commercially)

Goal: convert "architecturally a SaaS" into "proven SaaS."

- [ ] 👤 **One real external pilot** — a friendly local business that ISN'T you, onboarded through the cold path, taking real calls. Watch where it breaks. This validates A–D faster than any amount of internal testing.
- [ ] 👤 **Feedback loop** — a way for that pilot to tell you when the agent got something wrong, so you can tune it.

---

## Suggested sequence

1. **Kick off the slow clocks now (parallel):** A2P 10DLC registration + legal review — they have external wait times, so start them today. *(Gate A)*
2. **While those bake, I harden the self-serve path:** cold-path onboarding proof, per-plan gating decision, lapse-pauses-agent, monitoring. *(Gates B, C, D — the bulk of what I can just do)*
3. **Then line up the pilot** and run it through the now-hardened cold path. *(Gate E)*
4. **Owner mobile app** proceeds in parallel the whole time — it blocks nothing above.

## Definition of "true self-serve SaaS" (done when ALL are true)

- ✅ A stranger signs up, pays, and gets a working, routed AI number **with zero manual steps from you**
- ✅ SMS actually delivers (A2P approved)
- ✅ The plan they pay for is exactly what they get; a lapse cleanly cuts off service
- ✅ Terms/privacy/recording-consent are legally reviewed
- ✅ You get paged when it breaks
- ✅ At least one real external business is live on it

## Explicitly deferred (NOT launch blockers — see BACKLOG.md)

Multi-shop owner UI · warm-transfer-with-fallback · Spanish support · recording playback ·
missed-call text-back polish · advanced analytics. These make it *better*, not *launchable*.
