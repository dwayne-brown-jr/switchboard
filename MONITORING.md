# Monitoring

Production monitoring for Switchboard, defined as code with [Checkly](https://www.checklyhq.com/).
Everything lives in `__checks__/` and `checkly.config.ts`; nothing is configured by
clicking around in a dashboard.

Reliability *is* the product promise here — a shop owner pays $149/mo because the
phone gets answered. These checks exist to notice when that stops being true
before a customer does.

---

## What's monitored

| Check | What it proves | Frequency |
|---|---|---|
| **Health — app + Turso** (`__checks__/api/critical.check.ts`) | App serving **and** the database is reachable. Asserts `status:"ok"` and `db:"ok"`, not just HTTP 200. | 10 min |
| **Landing page** | Top of funnel renders — asserts the hero headline is actually in the HTML, so an error shell fails. | 30 min |
| **Retell `call-events` reachable** (`__checks__/api/webhooks.check.ts`) | The call webhook route exists. Sends `GET` and expects **405** — see "why 405" below. | 1 hour |
| **A2P opt-in page** | `/sms-opt-in` is up and still contains the exact consent sentence carriers review. | 1 hour |
| **Dashboard sign-in flow** (`__checks__/browser/`) | Playwright: sign in via `/demo`, land on `/app`, confirm call history and booking metrics render. ⚠️ *deactivated — see below* | 1 hour |
| **6 cron heartbeats** (`__checks__/heartbeat/crons.check.ts`) | Each scheduled job actually completed. Passive — the job pings Checkly. | per schedule |

### Why webhook checks assert 405, not 200
Those handlers have **real side effects**: `call-events` writes `CallRecord` rows
and can fire owner SMS/push; the Twilio SMS webhook records STOP/START consent.
There is no sandbox mode, so posting synthetic payloads to production would
corrupt call history and could mark a real owner as opted-out.

Sending `GET` to a `POST`-only route returns **405**, which proves the route is
deployed and routable **without invoking any handler logic**. Verified against
production: every webhook route returns 405 on GET today. If one starts
returning 200, that's a genuine regression and the check fails.

### What is deliberately NOT monitored
- **Vendor APIs** (Retell, Twilio, Stripe, Anthropic). A third-party blip would
  page us for something we can't fix, and polling paid APIs every few minutes
  costs money. We monitor *our* handling of them instead.
- **Most individual routes.** The app is one Vercel deployment — routes ship
  atomically. If `/` and `/api/health` are up, the other routes exist. Per-route
  checks would burn the run budget to tell us what we already know.

---

## ⚠️ Free-tier budget — read before changing any frequency

The Hobby plan allows **10,000 API-check runs** and **1,000 browser-check runs**
per month, and it **hard-caps**: once exhausted, checks simply stop running.
Silently losing monitoring is worse than never having it, so everything is sized
with headroom.

```
runs/month = (43,200 / frequencyMinutes) × numberOfLocations

every  5m = 8,640   ← 86% of the entire API budget on ONE check
every 10m = 4,320
every 30m = 1,440
every 60m =   720
```

**Current spend: 7,200 / 10,000 API runs · 720 / 1,000 browser runs.**

**One location (`us-west-1`) on purpose.** Locations multiply run count.
us-west-1 is closest to our California customers and to the Vercel region.
Adding `us-east-1` doubles everything above and blows the cap — do it only after
upgrading to Starter ($24/mo, 25k API runs), then update `checkly.config.ts`.

---

## Current status (deployed)

Live in Checkly under **Switchboard Production Monitoring**. Alerts go to
`dwaynebrown2012@gmail.com`; all 11 checks are subscribed.

| | State |
|---|---|
| 4 API checks | ✅ passing |
| 6 cron heartbeats | ✅ created, ping URLs wired into Vercel |
| `cron-onboarding-sweep` | ✅ **verified end-to-end** — triggered via QStash, job ran, ping received |
| Browser check | ⏸️ deployed but **inactive** — waiting on the demo env vars below |

The other five heartbeats show no data until their first scheduled run (daily
jobs within 24h, the weekly digest by next Monday). Their grace periods are long
enough that this is expected, not a fault.

**Remaining to do:** set `DEMO_LOGIN_EMAIL` + `DEMO_LOGIN_CODE` in Vercel, seed
the demo shop, add `DEMO_LOGIN_CODE` to Checkly, then flip the browser check to
`activated: true`. Full steps in "Activate the browser check" below.

> One cosmetic note: the account has two email alert channels — Checkly creates a
> default one on signup (0 subscriptions, sends nothing) alongside the one this
> project manages. Harmless; delete the empty one in the UI if it bothers you.

---

## First-time setup

### 1. Authenticate the CLI
Create an API key at <https://app.checklyhq.com/accounts/settings/user/api-keys>, then:

```bash
export CHECKLY_API_KEY=...      # never commit these
export CHECKLY_ACCOUNT_ID=...
npx checkly whoami              # verify
```

(`npx checkly login` also works but needs an interactive browser flow.)

### 2. Dry-run, then deploy
```bash
npx checkly test                # runs every check once, deploys nothing
npx checkly deploy              # creates the checks in your account
```

### 3. Wire up the heartbeats
Heartbeats only work once each job knows its ping URL. After `deploy`:

1. Open each heartbeat monitor in the Checkly UI and copy its **ping URL**.
2. Add them to **Vercel → Settings → Environment Variables (Production)**:

| Env var | Job |
|---|---|
| `HEARTBEAT_URL_ONBOARDING_SWEEP` | `/api/jobs/onboarding-sweep` |
| `HEARTBEAT_URL_USAGE_SWEEP` | `/api/jobs/usage-sweep` |
| `HEARTBEAT_URL_REMINDERS` | `/api/jobs/reminders` |
| `HEARTBEAT_URL_RECLAIM_NUMBERS` | `/api/jobs/reclaim-numbers` |
| `HEARTBEAT_URL_HEALTH_CHECK` | `/api/jobs/health-check` |
| `HEARTBEAT_URL_WEEKLY_DIGEST` | `/api/jobs/weekly-digest` |

3. Redeploy so the vars take effect.

Until a URL is set the job just doesn't ping — and the monitor **will alert**.
Set them promptly, or leave those monitors deactivated in the meantime.

### 4. Activate the browser check
It ships **deactivated** because it depends on the demo login existing. To turn on:

1. Set `DEMO_LOGIN_EMAIL` and `DEMO_LOGIN_CODE` in **Vercel** (production) and
   seed the demo shop: `node scripts/seed-demo-shop.mjs`. Confirm
   `getswitchboardhq.com/demo` loads rather than 404s.
2. Add `DEMO_LOGIN_CODE` as an **environment variable in Checkly**
   (Account → Variables). **Never** hardcode it in `__checks__/` — that
   directory is committed.
3. Set `activated: true` in `__checks__/browser/dashboard.check.ts` and redeploy.

The spec self-skips when `DEMO_LOGIN_CODE` is missing, so an accidental
activation reports *skipped* rather than a false alarm.

---

## Environment variables

**In Checkly** (Account → Variables):

| Variable | Purpose | Secret? |
|---|---|---|
| `DEMO_LOGIN_CODE` | Lets the browser check sign in | **Yes** |
| `MONITOR_BASE_URL` | Optional — target a preview deploy instead of production | No |

**In your shell when running `checkly deploy`:**

| Variable | Purpose |
|---|---|
| `CHECKLY_API_KEY`, `CHECKLY_ACCOUNT_ID` | CLI auth |
| `ALERT_EMAIL` | Where alerts go (defaults to the operator address) |

**In Vercel (production):** the six `HEARTBEAT_URL_*` vars above.

No secrets belong in this repo. `.checkly/` is gitignored.

---

## Alerting

`__checks__/alert-channels.ts` exports an **array**, so adding a channel is a
one-line change and no check needs touching.

- **Email** → `ALERT_EMAIL`, with failure, recovery, **and** degraded enabled,
  plus SSL-expiry warnings 14 days out (the whole product is a phone number on a
  domain — a silently expired cert breaks the dashboard and the demo call).
- **Retries:** one retry, 30s backoff, before anything alerts. This is what stops
  a single blip from paging you at 2am.
- **Adding Slack later:** import `SlackAppAlertChannel`, construct it with the
  `#channel` name, push it into the `alertChannels` array. Done.

---

## Running locally

```bash
npx checkly test                       # all checks, once
npx checkly test --grep "Health"       # just one
npx checkly test --record              # keep results in Checkly
MONITOR_BASE_URL=https://preview-url npx checkly test   # against a preview deploy
```

Checks run on **Checkly's cloud**, not your machine — the target URL must be
publicly reachable. `localhost` will not work; use a preview deployment.

---

## Adding a new check

1. Create `__checks__/<type>/<name>.check.ts`.
2. Import `alertChannels` from `../alert-channels` and spread it in.
3. **Do the budget math first** (formula above) and confirm the total still fits
   inside 10,000 API / 1,000 browser runs, with headroom.
4. Tag it (`critical`, `webhooks`, `dashboard`, `cron`, `compliance`, `billing`).
5. `npx checkly test` → then `npx checkly deploy`.

Before adding a check, ask whether it can fail *independently* of something
already covered. If `/api/health` failing would also make the new check fail,
it's redundant — and on a hard-capped plan, redundant checks cost you real
coverage elsewhere.
