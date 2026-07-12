import { prisma } from "./db";

/** Records an owner- or system-initiated change on a shop (who/what/when).
 *  Best-effort — never throws into the caller's flow. */
export async function logAudit(shopId: string, actorId: string | null, action: string, detail?: unknown) {
  try {
    await prisma.auditLog.create({
      data: { shopId, actorId: actorId ?? null, action, detail: (detail as never) ?? undefined },
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}
