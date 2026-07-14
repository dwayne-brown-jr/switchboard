# Switchboard — Backlog / Known Deferred Items

Tracked so nothing gets lost. Ordered roughly by when it must be addressed.

## Before onboarding a 2nd live shop
- [x] **Cross-shop calendar isolation — DONE (2026-07-12, option 2: own the scheduling).**
      Switchboard now computes availability itself: `lib/scheduling.ts` generates open slots
      from the shop's live `config.hours` (in the shop's timezone, DST-correct) minus that
      shop's OWN bookings, stored in the new `Booking` table. The agent tools
      (`/api/agent/check-availability`, `/api/agent/create-booking`) read/write our DB via
      `lib/booking.ts` (booking re-validated in a transaction → no double-book). Isolation is
      now **structural** — each availability query filters by `shopId`, so one shop can never
      block another. Cal.com fully removed from the availability path (`lib/integrations/calcom.ts`
      deleted; provision_calendar + publishVersion no longer call it; `Shop.calEventTypeMap` is
      now legacy/unused). **Deploy step:** apply `prisma/prod-migrations/2026-07-12-add-booking.sql`
      to prod Turso before/with the deploy (`turso db shell switchboard < …`). Rejected option 1
      (per-shop Cal.com managed users) — needs a paid Platform plan + OAuth creds + token
      lifecycle, and still couples core availability to a third party.
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
- [ ] **Upcoming-appointments view.** Now unblocked — bookings live in our own `Booking`
      table (see cross-shop isolation above); just needs a dashboard query + UI to surface them.
- [ ] **Missed-call text-back.** Advertised on the Front Desk plan; not implemented.
- [ ] **Plan gating.** Plan tiers are currently cosmetic — no feature/volume differences.
- [ ] **Spanish / multilingual** agent support.
- [ ] **Per-service appointment durations.** Every booking is a fixed 60-min slot
      (`SLOT_MINUTES`), which is wrong for e.g. a vehicle wrap or post-construction
      cleaning. When added, also make `check-availability` honor the `service` param
      its tool schema already advertises (the route currently ignores it).
- [ ] **Demo agents for all verticals.** Landing-page live demo only exists for
      auto / auto_appearance / hvac; cleaning, home_services, and other fall back to
      an HVAC prompt (`lib/demo.ts`).

## Owner mobile app (see separate plan)
- [ ] Phase 0: authenticated API layer + push notification delivery.
- [ ] Phase 1: Expo app — login, home, calls feed, push, pause.
- [ ] Phase 2: appointments, recording playback, return-call.
- [ ] Phase 3: in-app VoIP (answer/return calls) with CallKit/ConnectionService.
