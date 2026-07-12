# Switchboard Platform

A self-serve web platform where a local service-business owner (auto repair, HVAC,
home services) signs up, answers a guided wizard about their shop, subscribes, and
the platform automatically provisions a fully configured AI phone receptionist —
voice agent, booking calendar, phone number, SMS — then walks them through the two
things only they can do (call forwarding, texting compliance) and takes them live.

**Design philosophy — guardrailed self-serve.** Owners never see or edit a raw agent
prompt. They edit **structured fields only** (services, prices, hours, FAQs, emergency
rules). The platform generates the agent configuration from those fields and runs an
automated QA gate on every version before it can go live.

**Credential model — platform-level keys only.** Every vendor account (Anthropic,
Retell, Cal.com, Twilio, Stripe, Resend, Upstash, Turso) belongs to the platform
operator and is configured once via env vars. Per-shop resources are created inside
the platform's master accounts via API and tagged `sb_{shopId}`. The app never asks a
shop owner for a vendor credential.

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Prisma 6** + **Turso/libSQL** (`@prisma/adapter-libsql`)
- **Tailwind CSS 4**
- **better-auth** — email magic-link sign-in (no passwords), via **Resend**
- **Anthropic SDK** — config polish, website prefill, QA review
- **Stripe**, **Twilio**, **Retell/Vapi**, **Cal.com**, **Upstash QStash/Redis** (Phase 2+)

## Build status — phased

All three phases are complete.

| Phase | Scope | Status |
|-------|-------|--------|
| **1** | Skeleton, magic-link auth, guided wizard, the "brain" (config → prompt → QA), onboarding engine, owner "Meet your receptionist" + setup checklist, admin panel | ✅ Done |
| **2** | Stripe billing gate, real provisioning (voice/calendar/number), the three walls (test call, forwarding verification, A2P), call ingest, go-live | ✅ Done |
| **3** | Owner dashboard (stats + recent calls + pause), weekly digest email, guardrailed settings (edit → version → QA → publish → rollback), full admin, Upstash rate limiting, audit log | ✅ Done |

**In-browser test call:** owners can talk to their receptionist from the browser (Retell web call) with no phone number — used on the go-live test step.

**Real integrations wired & verified live:** Retell (voice), Cal.com (booking), Stripe (billing), Upstash (jobs + rate limit), and an n8n Cloud broker (`n8n/switchboard-core.json`) that books real Cal.com appointments. Twilio (real phone number + SMS) is code-complete and unlocks once a Twilio compliance profile is approved.

## Getting started (Phase 1)

Phase 1 runs with **only the Phase-1 env group** — no billing, voice, or telephony keys.

```bash
# 1. Configure env
cp .env.example .env
#    Minimum to run: AUTH_SECRET (openssl rand -base64 32) and ADMIN_EMAILS.
#    DATABASE_URL defaults to a local sqlite file (prisma/dev.db).
#    ANTHROPIC_API_KEY / RESEND_API_KEY are optional in dev (see below).

# 2. Set up the database
npm run db:push        # creates prisma/dev.db from the schema
npm run db:generate

# 3. Run
npm run dev            # http://localhost:3000
```

**Dev without vendor keys:** with no `RESEND_API_KEY`, the magic-link sign-in email is
printed to the server console — copy the link to sign in. With no `ANTHROPIC_API_KEY`,
the wizard uses a deterministic local fallback for prompt generation and QA, so the
whole flow still works end-to-end. Add real keys for website prefill and richer QA.

**Admin:** sign in with an email listed in `ADMIN_EMAILS` and visit `/admin`.

See [SETUP.md](SETUP.md) for the one-time operator vendor setup (Day-0 guide).

## Project layout

```
app/
  page.tsx               Marketing landing
  login/                 Magic-link sign-in
  app/                   Owner area (auth-gated)
    page.tsx             Hub: Meet-your-receptionist + setup checklist
    setup/               The guided wizard
  admin/                 Operator panel (double-gated: ADMIN_EMAILS + isAdmin)
  api/auth/[...all]/     better-auth handler
lib/
  db.ts                  Prisma + libSQL adapter
  auth.ts / session.ts   Auth + server-side session/admin guards
  llm.ts                 The brain: generateConfig / generatePrompt / qaReview
  templates/             Per-vertical prompt templates (safety rules baked in)
  verticals.ts           Per-vertical seed data + curated voices
  engine.ts              Onboarding state machine (advanceRun)
  pipeline.ts            The ordered step definitions
  steps/                 Auto-step handlers
prisma/schema.prisma     Data model
```
