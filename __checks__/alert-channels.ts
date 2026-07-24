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
// The full URL — including its ?secret — is read at deploy time from
// CRITICAL_ALERT_WEBHOOK_URL so the secret never enters the repo. When it's
// unset the channel isn't created and the critical checks simply fall back to
// email, so this is safe to ship before the secret is wired.
//
// sendRecovery too: a 3am "it's back" text is worth as much as the alarm.
const criticalWebhookUrl = process.env.CRITICAL_ALERT_WEBHOOK_URL;

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
