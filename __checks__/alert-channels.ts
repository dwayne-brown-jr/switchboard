import { EmailAlertChannel, WebhookAlertChannel } from "checkly/constructs";

// Alert routing for every check.
//
// Exported as an ARRAY so adding a channel later is a one-line change here and
// nothing else has to be touched — every check spreads `alertChannels`.
// To add Slack: import SlackAppAlertChannel, construct it with the #channel
// name, and push it into the array below.
//
// ALERT_EMAIL is read at *deploy* time by the CLI (not at check runtime), so it
// must be set in the shell that runs `npx checkly deploy` — see MONITORING.md.
// Falling back to the known operator address keeps `npx checkly test` working
// without extra setup; it is not a secret.
const alertEmail = process.env.ALERT_EMAIL ?? "dwaynebrown2012@gmail.com";

export const emailChannel = new EmailAlertChannel("switchboard-email-alerts", {
  address: alertEmail,
  sendFailure: true,
  sendRecovery: true,
  sendDegraded: true,
  // The whole product is a phone number on a domain — a silently expired
  // certificate would break the dashboard and the demo call.
  sslExpiry: true,
  sslExpiryThreshold: 14,
});

export const alertChannels = [emailChannel];

// Phone-waking escalation for the two checks that mean customers can't be
// served (DB down, voice path misconfigured). A webhook — not Checkly's SMS —
// because SMS is a paid feature that lapses when this trial ends, whereas
// webhooks work on the free plan forever. It POSTs to /api/alerts/critical,
// which texts the operator via the app's own Twilio (see that route for why
// that still works when the database is down).
//
// The full URL — including its ?secret — is read at deploy time so the secret
// never enters the repo.
//
// ⚠️ WHY THERE IS A FALLBACK, AND WHY IT MATTERS
//
// `checkly deploy` is DECLARATIVE: it deletes anything in the account that the
// parsed project doesn't declare. This channel used to come only from an
// explicit CRITICAL_ALERT_WEBHOOK_URL, set ad-hoc in one shell and persisted
// nowhere. That is safe exactly once. Every LATER deploy from a shell without
// that var silently dropped the channel from the project, so Checkly deleted
// it — quietly downgrading the two checks that mean customers can't be served
// (DB down, voice path misconfigured) from a phone-waking SMS to an email
// nobody reads at 3am. Caught by `--preview` showing `Delete:` on 2026-08-14.
//
// So: fall back to composing the URL from APP_URL + CRITICAL_ALERT_SECRET, both
// of which live in Vercel. `vercel env pull` before deploying is now enough to
// preserve the channel, and no one has to remember a variable that appears in
// no .env file.
//
// Still run `npx checkly deploy --preview` first and read the plan. If it says
// `Delete: AlertChannel`, STOP — the environment is incomplete, not the intent.
//
// sendRecovery too: a 3am "it's back" text is worth as much as the alarm.
const criticalWebhookUrl =
  process.env.CRITICAL_ALERT_WEBHOOK_URL ??
  (process.env.APP_URL && process.env.CRITICAL_ALERT_SECRET
    ? `${process.env.APP_URL}/api/alerts/critical?secret=${process.env.CRITICAL_ALERT_SECRET}`
    : undefined);

export const criticalChannels = criticalWebhookUrl
  ? [
      ...alertChannels,
      new WebhookAlertChannel("switchboard-critical-webhook", {
        name: "Critical → operator SMS",
        method: "POST",
        url: criticalWebhookUrl,
        template: JSON.stringify({ check_name: "{{CHECK_NAME}}", alert_type: "{{ALERT_TYPE}}" }),
        sendFailure: true,
        sendRecovery: true,
        sendDegraded: false,
      }),
    ]
  : alertChannels;
