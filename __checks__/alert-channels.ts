import { EmailAlertChannel } from "checkly/constructs";

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
