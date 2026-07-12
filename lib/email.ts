import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM ?? "Switchboard <onboarding@resend.dev>";

const resend = apiKey ? new Resend(apiKey) : null;

type SendArgs = { to: string; subject: string; html: string; text?: string };

/**
 * Sends an email via Resend. If no RESEND_API_KEY is configured (e.g. local
 * Phase-1 dev), the email is logged to the server console instead of throwing —
 * so magic-link sign-in still works without any vendor setup.
 */
export async function sendEmail({ to, subject, html, text }: SendArgs) {
  if (!resend) {
    console.log(
      `\n📧 [email:dev-console] to=${to}\n   subject: ${subject}\n   ${text ?? stripHtml(html)}\n`,
    );
    return { id: "dev-console", delivered: false as const };
  }
  const res = await resend.emails.send({ from, to, subject, html, text });
  if (res.error) throw new Error(`Resend error: ${res.error.message}`);
  return { id: res.data?.id ?? "sent", delivered: true as const };
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function magicLinkEmail(url: string) {
  return {
    subject: "Your Switchboard sign-in link",
    text: `Click to sign in to Switchboard: ${url}\n\nThis link expires in 15 minutes. If you didn't request it, you can ignore this email.`,
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
        <h1 style="font-size:20px;margin:0 0 8px">Sign in to Switchboard</h1>
        <p style="color:#475569;font-size:15px;line-height:1.5">Click the button below to sign in. This link expires in 15 minutes.</p>
        <p style="margin:24px 0">
          <a href="${url}" style="background:#0f172a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Sign in</a>
        </p>
        <p style="color:#94a3b8;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
      </div>`,
  };
}
