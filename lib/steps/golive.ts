import { prisma } from "../db";
import { notifyOwnerLive, notifyAdmins } from "../notify";
import { logAudit } from "../audit";
import { type AutoHandler, done, failed } from "./types";

// 14 — go_live. Reached once the test-call and forwarding user steps are done
// (A2P runs in parallel and does NOT block this). Flips the shop live, points
// it at the approved version, starts a 48-hour watch, and notifies everyone.
export const goLiveHandler: AutoHandler = async ({ shop }) => {
  const version = await prisma.agentVersion.findFirst({
    where: { shopId: shop.id, status: "approved" },
    orderBy: { createdAt: "desc" },
  });
  if (!version) return failed("No approved version to take live.");

  // Point the shop at the live version; archive any prior live version.
  await prisma.agentVersion.updateMany({ where: { shopId: shop.id, status: "live" }, data: { status: "archived" } });
  await prisma.agentVersion.update({ where: { id: version.id }, data: { status: "live" } });
  await prisma.shop.update({
    where: { id: shop.id },
    data: { status: "live", liveVersionId: version.id },
  });

  const watchUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  await logAudit(shop.id, null, "shop.went_live", { versionId: version.id });

  const fresh = await prisma.shop.findUnique({ where: { id: shop.id }, include: { owner: true } });
  if (fresh) {
    await notifyOwnerLive(fresh.owner.email, fresh.businessName, fresh.agentNumber ?? "your new number");
    await notifyAdmins("Shop went live 🎉", `${fresh.businessName} (${fresh.id}) is live on ${fresh.agentNumber}. 48h watch until ${watchUntil}.`);
  }

  return done({ liveVersionId: version.id, watchUntil });
};
