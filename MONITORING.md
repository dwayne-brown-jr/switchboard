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
| **Voice path** (`__checks__/api/critical.check.ts`) | The *product* still works: no live shop has gone silent past the window, and none is live-but-unanswerable (missing number or agent version). | 1 hour |
| **Error feed** (`__checks__/api/critical.check.ts`) | Nothing unexpected is throwing. The only check that catches failures nobody predicted — see below. | 1 hour |
| **Landing page** | Top of funnel renders — asserts the hero headline is actually in the HTML, so an error shell fails. | 30 min |
| **Retell `call-events` reachable** (`__checks__/api/webhooks.check.ts`) | The call webhook route exists. Sends `GET` and expects **405** — see "why 405" below. | 1 hour |
| **A2P opt-in page** | `/sms-opt-in` is up and still contains the exact consent sentence carriers review. | 1 hour |
| **Dashboard sign-in flow** (`__checks__/browser/`) | Playwright: sign in via `/demo`, land on `/app`, confirm call history and booking metrics render. | 1 hour |
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

### Why the voice-path check exists separately from the daily cron

`jobs/health-check` already detects silent shops daily and pages admins. The
Checkly check is a **second, independent path to the same finding**, for two
reasons:

1. **The cron alerts through our own email.** If Resend breaks or the sender
   domain lapses, `notifyAdmins()` never arrives and nothing reports that.
   Checkly is out-of-band.
2. **The heartbeat only proves the job ran, not what it found.** A green
   heartbeat and a silent shop are perfectly compatible.

It also carries a faster signal the cron doesn't: a shop that is `live` but has
no number or no live agent version can't answer *right now*, which needs no
multi-day silence window to be sure about.

The reviewer demo shop is excluded everywhere (`DEMO_SHOP_ID`) — its calls are
mock data frozen at seed time, so it reads as a silent live shop a few days
after every seed.

### Why the error-feed check is the highest-value one here

Every other check asks a question we thought to ask in advance: is the app up,
is the database reachable, can someone sign in, is the phone ringing. Each one
covers exactly the failure it was written for.

The error feed covers the rest. `reportError()` has always written every failure
to `FailureEvent` — nothing ever read it. Now a handler that starts throwing for
a reason nobody predicted surfaces within the hour.

**Tuning.** The threshold is sized from measured production data: the baseline
was **2 errors across seven days**, so three in a single hour is a real spike.
That only holds while traffic is low. Raise `ERROR_ALERT_THRESHOLD` as call
volume grows, or this becomes the alert everyone learns to ignore — which is
worse than not having it.

**Warns never alert.** The two that actually occur, `sweep:stuck` and
`health:silent`, are routine operational signals with their own dedicated
alerting. Paging on them here would be duplicate noise for something already
handled.

The endpoint returns **counts only** — never routes or messages. It is public,
and error text routinely carries shop names, phone numbers and vendor ids.

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

**Current spend: 8,640 / 10,000 API runs · 720 / 1,000 browser runs.**

**One location (`us-west-1`) on purpose.** Locations multiply run count.
us-west-1 is closest to our California customers and to the Vercel region.
Adding `us-east-1` doubles everything above and blows the cap — do it only after
upgrading to Starter ($24/mo, 25k API runs), then update `checkly.config.ts`.

---

## Current status (deployed)

Live in Checkly under **Switchboard Production Monitoring**. Alerts go to
`dwaynebrown2012@gmail.com`; all 13 checks are subscribed.

| | State |
|---|---|
| 6 API checks | ✅ passing |
| 6 cron heartbeats | ✅ created, ping URLs wired into Vercel |
| `cron-onboarding-sweep` | ✅ **verified end-to-end** — triggered via QStash, job ran, ping received |
| Browser check | ✅ **active** — signs in at `/demo` and asserts the dashboard renders |

> This check earned its keep immediately: its first real run exposed a broken
> demo sign-in. A Server Action redirected to better-auth's magic-link URL, and
> Next resolves Server Action redirect destinations *server-side* — so the
> framework consumed the single-use token and the session cookie never reached
> the browser. Fixed in `app/demo/enter/route.ts`. Never redirect from a Server
> Action to a single-use, side-effecting URL.

The other five heartbeats show no data until their first scheduled run (daily
jobs within 24h, the weekly digest by next Monday). Their grace periods are long
enough that this is expected, not a fault.

**Demo login is live.** `DEMO_LOGIN_EMAIL` (`demo@getswitchboardhq.com`) and
`DEMO_LOGIN_CODE` are set in Vercel production, the reviewer shop is seeded with
mock calls, and `DEMO_LOGIN_CODE` is stored as a secret in Checkly. The same
credentials double as reviewer access for pilot prospects.

> **Rotating the demo code:** change it in **both** Vercel and Checkly, or this
> check fails on sign-in. Clearing the Checkly variable is the safe way to pause
> it — the spec self-skips rather than false-alarming.

> One cosmetic note: the account has two email alert channels — Checkly creates a
> default one on signup (0 subscriptions, sends nothing) alongside the one this
> project manages. Harmless; delete the empty one in the UI if it bothers you.

---

## Runbook — an alert just arrived

Day to day there is nothing to do. Checks run on their own and you only hear
from Checkly when something breaks or recovers.

### Triage by which check fired

| Alert | What it means | First move |
|---|---|---|
| **Health — app + Turso** | App or database is down. Everything else is downstream of this. | Vercel and Turso status pages. Don't chase other alerts until this one clears. |
| **Voice path** | A live shop went silent past the window, or is live but can't answer. | Call that shop's number yourself. Nothing beats hearing it ring. |
| **Error feed** | Errors crossed the threshold in the last hour. | Query `FailureEvent` by `route` — the count is the alarm, the table is the detail. |
| **Landing page** | A deploy broke the site, or React shipped an error shell. | Roll back in Vercel, then diagnose. |
| **Dashboard sign-in** | Auth, session, or dashboard rendering is broken. | Try `/demo` by hand — the failure is usually visible in one attempt. |
| **Webhook reachable** | A route stopped being routable, or started accepting `GET`. | Almost always a deploy or middleware change. |
| **A2P opt-in page** | The page carriers read during campaign review is down. | Fix urgently if a campaign is under review; a 404 mid-review can fail it. |
| **Cron heartbeat missed** | A job didn't run, or threw before it could ping. | QStash delivery log first, then Vercel function logs for that route. |

Recovery emails are enabled, so a blip that heals itself tells you it healed.
Two alerts arriving together usually means one cause — start at the top of this
table, not with whichever email you opened first.

### Changing a check

Checks are code. **Never edit them in the Checkly UI** — the next `deploy`
silently overwrites your change, which is worse than it not working at all.

```bash
# edit __checks__/…
npx checkly test                    # dry run against production, deploys nothing
npx checkly test --grep "Voice"     # just one
npx checkly deploy                  # make it live
```

### Commands worth remembering

```bash
npx checkly checks list                            # everything, with status
npx checkly checks get <id>                        # detail + recent failure groups
npx checkly checks get <id> --error-group <id>     # why it actually failed
npx checkly trigger --tags voice                   # run a DEPLOYED check right now
```

**`test` vs `trigger` is the distinction that matters.** `test` runs your *local*
files with your *local* env vars. `trigger` runs the *deployed* check with
*Checkly's* stored secrets. When something passes locally but fails deployed,
that gap is almost always the reason — it is how we established the demo-code
wiring was fine and the app itself was broken.

### Three things that will bite you

1. **The run budget is a hard cap, and it fails silently.** When it is exhausted
   checks simply stop running — you get no alert about losing alerting. Do the
   arithmetic above before changing any frequency.
2. **`DEMO_LOGIN_CODE` lives in two places** — Vercel and Checkly. Rotate both or
   the browser check fails on sign-in.
3. **Warns never page you.** `sweep:stuck` and `health:silent` come from the
   daily cron's own email, not from Checkly.

The web dashboard at <https://app.checklyhq.com> is worth opening for failure
screenshots and response-time history, which the CLI does not show well.

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
