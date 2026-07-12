import { sendEmail } from "./email";
import { adminEmails } from "./admin";

// Central notification helpers. Owner-facing messages are plain and calm;
// admin messages carry the real detail. Phase 1 covers admin step-failure
// alerts; owner/digest notifications expand in Phases 2–3.

export async function notifyAdmins(subject: string, body: string) {
  const admins = adminEmails();
  console.log(`\n🔔 [admin] ${subject}\n   ${body}\n`);
  if (admins.length === 0) return;
  await Promise.all(
    admins.map((to) =>
      sendEmail({
        to,
        subject: `[Switchboard admin] ${subject}`,
        html: `<pre style="font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap">${escapeHtml(body)}</pre>`,
        text: body,
      }).catch((e) => console.error("admin email failed", e)),
    ),
  );
}

export async function notifyOwnerLive(email: string, businessName: string, agentNumber: string) {
  await sendEmail({
    to: email,
    subject: `🎉 ${businessName} is live on Switchboard`,
    text: `Great news — your receptionist is now answering calls at ${agentNumber}.\n\nWhat happens next: every call that isn't picked up by your team goes to your receptionist, which answers, books jobs, and texts you the emergencies. Keep an eye on your dashboard to see the calls come in.`,
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
        <h1 style="font-size:22px;margin:0 0 8px">You're live! 🎉</h1>
        <p style="color:#475569;font-size:15px;line-height:1.5">Your receptionist is now answering calls at <strong>${agentNumber}</strong>.</p>
        <p style="color:#475569;font-size:15px;line-height:1.5">Every call your team doesn't pick up goes to your receptionist — it answers, books jobs on your calendar, and texts you the emergencies. Watch them roll in on your dashboard.</p>
        <p style="margin-top:20px"><a href="${process.env.APP_URL ?? "http://localhost:3000"}/app" style="background:#2449d6;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Open my dashboard</a></p>
      </div>`,
  });
}

/** Real-time backstop when a call is booked or flagged urgent. Fired from the
 *  call-ingest endpoint so the owner learns immediately, independent of whether
 *  the agent invoked notify_owner mid-call. Email only (the agent's notify_owner
 *  handles emergency SMS) — best-effort, never throws into ingest. */
export async function notifyOwnerRealtimeCall(email: string, businessName: string, kind: "booked" | "emergency", detail: string) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const emergency = kind === "emergency";
  const line = detail ? ` (${detail})` : "";
  await sendEmail({
    to: email,
    subject: emergency ? `🚨 Emergency call flagged — ${businessName}` : `📅 New job booked — ${businessName}`,
    text: emergency
      ? `Your receptionist flagged an urgent call for ${businessName}${line}. Check your dashboard for details: ${appUrl}/app`
      : `Your receptionist just booked a job for ${businessName}${line}. See it on your dashboard: ${appUrl}/app`,
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
        <h1 style="font-size:20px;margin:0 0 8px">${emergency ? "🚨 Urgent call flagged" : "📅 New job booked"}</h1>
        <p style="color:#475569;font-size:15px;line-height:1.5">${emergency ? "Your receptionist flagged an urgent call" : "Your receptionist just booked a job"} for <strong>${escapeHtml(businessName)}</strong>${escapeHtml(line)}.</p>
        <p style="margin-top:20px"><a href="${appUrl}/app" style="background:${emergency ? "#dc2626" : "#2449d6"};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Open dashboard</a></p>
      </div>`,
  });
}

export async function notifyOwnerBilling(email: string, businessName: string, kind: "past_due" | "canceled") {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  if (kind === "past_due") {
    await sendEmail({
      to: email,
      subject: `Payment issue for ${businessName} — action needed`,
      text: `We couldn't process your latest payment for ${businessName}'s receptionist. Please update your card soon to keep it answering calls.\n\nManage billing: ${appUrl}/app`,
      html: `
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
          <h1 style="font-size:20px;margin:0 0 8px">Payment issue — action needed</h1>
          <p style="color:#475569;font-size:15px;line-height:1.5">We couldn't process your latest payment for <strong>${businessName}</strong>'s receptionist. Update your card soon to keep it answering calls.</p>
          <p style="margin-top:20px"><a href="${appUrl}/app" style="background:#ea580c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Update payment</a></p>
        </div>`,
    });
  } else {
    await sendEmail({
      to: email,
      subject: `${businessName}'s receptionist has been paused`,
      text: `Your subscription was canceled, so your receptionist has stopped answering calls. You can resubscribe anytime: ${appUrl}/app`,
      html: `
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
          <h1 style="font-size:20px;margin:0 0 8px">Your receptionist is paused</h1>
          <p style="color:#475569;font-size:15px;line-height:1.5">Your subscription was canceled, so <strong>${businessName}</strong>'s receptionist has stopped answering calls. You can resubscribe anytime.</p>
          <p style="margin-top:20px"><a href="${appUrl}/app" style="background:#2449d6;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Reactivate</a></p>
        </div>`,
    });
  }
}

export async function notifyAdminStepFailed(args: { runId: string; key: string; message: string }) {
  await notifyAdmins(
    `Step failed: ${args.key}`,
    `Run: ${args.runId}\nStep: ${args.key}\nError: ${args.message}\n\nRetry from the admin panel: /admin`,
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
}
