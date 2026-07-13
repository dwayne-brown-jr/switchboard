import "server-only";
import { prisma } from "./db";
import { reportError } from "./observability";
import { notifyAdmins } from "./notify";

// Proactive voice-path health check. A live shop whose Twilio number silently
// stops routing (SIP trunk issue, unbound number, carrier problem) would take
// calls to a dead line with nobody noticing. We can't ping the trunk directly,
// but we CAN watch for the tell-tale symptom: a shop that WAS receiving calls
// and suddenly goes quiet. Runs from a daily cron (/api/jobs/health-check).

const SILENT_DAYS = Number(process.env.SILENT_SHOP_DAYS ?? 4);
const REALERT_HOURS = 24;

/** Flag live shops that had call history and then went silent for SILENT_DAYS —
 *  a likely broken voice path. Deliberately skips shops with NO call history
 *  (can't distinguish "broken" from "low-traffic / brand new"). Deduped via the
 *  failure feed so a persistently-silent shop pages at most once a day. */
export async function detectSilentShops(): Promise<{ scanned: number; silent: number }> {
  const cutoff = Date.now() - SILENT_DAYS * 86_400_000;
  const shops = await prisma.shop.findMany({
    where: { status: "live", liveVersionId: { not: null } },
    select: { id: true, businessName: true },
  });

  let silent = 0;
  for (const shop of shops) {
    const lastCall = await prisma.callRecord.findFirst({
      where: { shopId: shop.id },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    });
    // No history → can't tell broken from low-traffic. Had a call recently → fine.
    if (!lastCall || lastCall.timestamp.getTime() > cutoff) continue;

    // Dedupe: only page once per REALERT_HOURS per shop.
    const since = new Date(Date.now() - REALERT_HOURS * 3_600_000);
    const recent = await prisma.failureEvent.findFirst({
      where: { route: "health:silent", shopId: shop.id, createdAt: { gte: since } },
    });
    if (recent) continue;

    const days = Math.round((Date.now() - lastCall.timestamp.getTime()) / 86_400_000);
    const msg = `No calls in ${days}d — ${shop.businessName} (${shop.id}). Possible broken voice path.`;
    await reportError(new Error(msg), { source: "job", route: "health:silent", shopId: shop.id, level: "warn" });
    await notifyAdmins("Shop went silent", msg).catch(() => {});
    silent++;
  }
  return { scanned: shops.length, silent };
}
