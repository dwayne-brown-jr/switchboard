import { prisma } from "./db";
import { getStats, formatMoney } from "./stats";
import { plan } from "./plans";
import { sendEmail } from "./email";
import { signPayload } from "./secure";

// Weekly digest — the retention engine. Owner-language summary of last week's
// results, emailed to every live shop. Scheduled via QStash (see the job route)
// and triggerable manually for testing.

export async function sendWeeklyDigest(shopId: string): Promise<{ sent: boolean; reason?: string }> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, include: { owner: true } });
  if (!shop) return { sent: false, reason: "no shop" };
  if (shop.status !== "live") return { sent: false, reason: "not live" };
  if (shop.digestOptOut) return { sent: false, reason: "opted out" };

  const s = await getStats(shopId, 7);
  if (s.callsAnswered === 0) return { sent: false, reason: "no calls this week" };

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const unsubUrl = `${appUrl}/api/unsubscribe?shop=${shop.id}&token=${signPayload(`unsub:${shop.id}`)}`;
  const headline = `Your receptionist answered ${s.callsAnswered} call${s.callsAnswered === 1 ? "" : "s"} and booked ${s.jobsBooked} job${s.jobsBooked === 1 ? "" : "s"} worth about ${formatMoney(s.revenueBooked)} this week.`;

  // ROI framing — the churn defense. Only when the captured value clears the
  // plan price, so it always reads as a win rather than a stretch.
  const planPrice = plan(shop.plan ?? "front_desk")?.price ?? 149;
  const roiX = s.revenueBooked >= planPrice ? Math.round(s.revenueBooked / planPrice) : 0;
  const roiLine = roiX >= 2 ? `That's roughly ${roiX}× the ${formatMoney(planPrice)} you pay for Switchboard — captured, not missed.` : "";

  const rows: [string, string][] = [
    ["Calls answered", `${s.callsAnswered}`],
    ["After-hours calls", `${s.afterHours}`],
    ["Jobs booked", `${s.jobsBooked}`],
    ["Revenue booked (est.)", formatMoney(s.revenueBooked)],
    ["Emergencies flagged", `${s.hotJobs}`],
    ["Missed calls recovered", `${s.recovered}`],
  ];

  await sendEmail({
    to: shop.owner.email,
    subject: `${shop.businessName}: your week with Switchboard`,
    text: `${headline}${roiLine ? `\n\n${roiLine}` : ""}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nSee details: ${appUrl}/app\n\nDon't want the weekly summary? Unsubscribe: ${unsubUrl}`,
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
        <h1 style="font-size:20px;margin:0 0 6px">This week at ${escapeHtml(shop.businessName)}</h1>
        <p style="font-size:16px;line-height:1.5;color:#1e293b">${escapeHtml(headline)}</p>
        ${roiLine ? `<p style="margin:12px 0 0;padding:12px 16px;background:#eef2ff;border-radius:10px;font-size:15px;font-weight:600;color:#3730a3">${escapeHtml(roiLine)}</p>` : ""}
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          ${rows
            .map(
              ([k, v]) =>
                `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:14px">${k}</td><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;font-size:14px">${v}</td></tr>`,
            )
            .join("")}
        </table>
        <p style="margin-top:20px"><a href="${appUrl}/app" style="background:#2449d6;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">See your dashboard</a></p>
        <p style="margin-top:24px;font-size:12px;color:#94a3b8">You're getting this weekly summary for ${escapeHtml(shop.businessName)}. <a href="${unsubUrl}" style="color:#94a3b8">Unsubscribe</a>.</p>
      </div>`,
  });
  return { sent: true };
}

/** Send digests to every live shop (called by the weekly QStash job). */
export async function sendAllDigests(): Promise<{ sent: number; skipped: number }> {
  const shops = await prisma.shop.findMany({ where: { status: "live" }, select: { id: true } });
  let sent = 0,
    skipped = 0;
  for (const shop of shops) {
    const r = await sendWeeklyDigest(shop.id).catch(() => ({ sent: false }));
    r.sent ? sent++ : skipped++;
  }
  return { sent, skipped };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
}
