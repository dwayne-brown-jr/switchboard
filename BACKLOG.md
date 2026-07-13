# Switchboard — Backlog / Known Deferred Items

Tracked so nothing gets lost. Ordered roughly by when it must be addressed.

## Before onboarding a 2nd live shop
- [ ] **Cross-shop calendar isolation.** All shops currently share ONE Cal.com user, so
      shop A's booking blocks shop B at the same clock-time (user-level busy check),
      while B's slots may still show it → cross-shop "offer-then-fail." Single-shop
      availability is correct (one event type per shop, hours synced). Fix options:
      (1) per-shop Cal.com **managed users** (Cal.com Platform plan + OAuth client creds), or
      (2) **own the scheduling** (compute slots from shop hours minus that shop's own
      bookings in our DB — removes Cal.com dependency, fully multi-tenant).
- [ ] **Multi-shop owner UI.** Every owner page resolves the shop via `findFirst` (oldest);
      a second shop per owner is silently unreachable. Add a shop switcher.

## Before real external launch
- [ ] **Resend verified domain.** Owner emails (billing, booking/emergency backstop,
      digest, magic link) currently only log to Vercel — they don't reach inboxes until a
      sending domain is verified. Highest-leverage open item.
- [ ] **Legal review.** /terms and /privacy are plain-language starters; have counsel
      review before relying on them (esp. call-recording consent + SMS/A2P).
- [ ] **Per-shop A2P/10DLC.** SMS (notify_owner, missed-call text-back) needs each shop
      registered; today only Riverside's number is approved.

## Observability / ops
- [ ] **Sentry + alerts.** Code is wired and dormant; set `SENTRY_DSN` / `ALERT_WEBHOOK_URL`
      in Vercel to activate. Add a SIP-trunk + booking canary.
- [ ] **Shared SIP trunk is a single point of failure** for all shops' inbound voice —
      add a health check + alert + documented recovery.

## Product depth
- [ ] **Warm transfer + hold/fallback.** Handoff is currently a *cold* transfer; warm
      (agent briefs the owner, falls back to a message on no-answer) is nicer — Retell's
      warm_transfer schema needs more discovery.
- [ ] **Owner account management.** Change email, delete shop/account, data export (also a
      privacy-law requirement).
- [ ] **Upcoming-appointments view.** Bookings are pushed to Cal.com but never read back
      into the dashboard.
- [ ] **Missed-call text-back.** Advertised on the Front Desk plan; not implemented.
- [ ] **Plan gating.** Plan tiers are currently cosmetic — no feature/volume differences.
- [ ] **Spanish / multilingual** agent support.

## Owner mobile app (see separate plan)
- [ ] Phase 0: authenticated API layer + push notification delivery.
- [ ] Phase 1: Expo app — login, home, calls feed, push, pause.
- [ ] Phase 2: appointments, recording playback, return-call.
- [ ] Phase 3: in-app VoIP (answer/return calls) with CallKit/ConnectionService.
