# Operator setup — Day-0 vendor guide

One-time platform setup for the operator. All vendor accounts belong to **you**
(the platform), configured once as environment variables. After keys are in `.env`,
no vendor dashboard is part of any customer signup — every per-shop resource is
created by the platform via API under these accounts, tagged `sb_{shopId}`.

Do the **Phase-1 group** first; add the **Phase-2 group** when you start Phase 2.

## Phase 1 group

1. **Turso** — [turso.tech](https://turso.tech) → create database → copy the libSQL URL
   → `DATABASE_URL`; create an auth token → `TURSO_AUTH_TOKEN`.
   *(For local dev you can skip Turso and use the default `DATABASE_URL="file:./dev.db"`.)*
2. **Auth secret** — generate locally: `openssl rand -base64 32` → `AUTH_SECRET`.
3. **Anthropic** — [console.anthropic.com](https://console.anthropic.com) → API Keys →
   Create Key → `ANTHROPIC_API_KEY`. Add a payment method (pay-as-you-go; wizard runs
   cost cents).
4. **Resend** — [resend.com](https://resend.com) → API Keys → Create → `RESEND_API_KEY`.
   Verify a sending domain (Domains → add DNS records) so magic links and digests don't
   land in spam.
5. Set `ADMIN_EMAILS` (your email) and `APP_URL` (http://localhost:3000 in dev).

## Phase 2 group

6. **Retell** — [dashboard.retellai.com](https://dashboard.retellai.com) → API Keys →
   `RETELL_API_KEY`. Trial credits are enough for testing.
7. **Cal.com** — [app.cal.com](https://app.cal.com) → Settings → Developer → API Keys →
   `CALCOM_API_KEY`. Free tier is fine.
8. **Twilio** — [console.twilio.com](https://console.twilio.com) → Account Info panel →
   `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN`. **Upgrade off trial** (add a card) —
   required to buy real numbers (~$1–2/mo each) and to submit A2P.
9. **Stripe** — [dashboard.stripe.com](https://dashboard.stripe.com) (Test mode first) →
   Developers → API keys → secret key → `STRIPE_SECRET_KEY`; create 3 Products with
   monthly Prices (Catch / Front Desk / Growth) → copy price IDs → `STRIPE_PRICE_*`;
   Developers → Webhooks → add endpoint `{APP_URL}/api/webhooks/stripe` → signing secret
   → `STRIPE_WEBHOOK_SECRET`.
10. **Upstash** — [console.upstash.com](https://console.upstash.com) → QStash →
    `QSTASH_TOKEN` + current/next signing keys; create a Redis database → REST URL + token
    → `UPSTASH_REDIS_REST_URL|TOKEN`.
11. **n8n** — your self-hosted instance: note the broker webhook base URL → `N8N_BROKER_URL`;
    stand up the registry endpoint/table the flows read → `N8N_REGISTRY_URL` + mint a token
    → `N8N_REGISTRY_TOKEN`.

---

## Scheduled jobs (QStash)

After deploying to a public URL, create the recurring jobs in the Upstash QStash
console (Schedules → Create) pointing at your deployed app:

- **Weekly digest** — cron `0 14 * * 1` (Mondays 2pm UTC) → `POST {APP_URL}/api/jobs/weekly-digest`
- **Onboarding sweep** — cron `*/30 * * * *` (every 30 min) → `POST {APP_URL}/api/jobs/onboarding-sweep`
  Self-heals signups whose progress signal was lost (missed Stripe webhook, crashed
  auto pass): reconciles subscribe-stalled runs against Stripe, resumes in_progress
  runs, and pages admins about runs stuck > `ONBOARDING_STUCK_HOURS` (default 72).
- **Reclaim numbers** — cron `0 3 * * *` (daily 3am UTC) → `POST {APP_URL}/api/jobs/reclaim-numbers`
  Permanently releases the Twilio number of any shop that has stayed canceled
  longer than `CANCEL_GRACE_DAYS` (default 30), so churned shops stop costing the
  monthly number fee. Resubscribing within the window keeps the number.
- **Health check** — cron `0 15 * * *` (daily 3pm UTC) → `POST {APP_URL}/api/jobs/health-check`
  Pages admins when a live shop that was receiving calls goes silent for
  `SILENT_SHOP_DAYS` (default 4) — the tell-tale sign of a broken voice path.
- **Reminders** — cron `0 16 * * *` (daily 4pm UTC) → `POST {APP_URL}/api/jobs/reminders`
  Emails owners: escalating past-due dunning (day 3 + day 7; day 1 fires live) and
  a one-time nudge to anyone stalled mid-onboarding past `ONBOARDING_NUDGE_DAYS`
  (default 2). Never pauses service — cancellation is the only hard stop.

The A2P-poll and forwarding-timeout jobs are scheduled automatically by the app
when those steps run; they only fire once the app is reachable at a public URL
(QStash can't call `localhost`).

## Extension point (not built in v1)

Twilio supports creating an isolated **subaccount per customer** via API under the same
master credentials. In v1 every shop shares the single master account; the subaccount
split would slot in at number purchase / A2P submission time (see `lib/integrations/twilio.ts`
once Phase 2 lands). Keep v1 on the single master account.
