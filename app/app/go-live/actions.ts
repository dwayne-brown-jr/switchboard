"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { completeUserStep } from "@/lib/engine";
import { notifyAdmins } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import { setCarrier, startVerification, markVerified, getForwardingState } from "@/lib/forwarding";
import { submitA2P as doSubmitA2P, skipA2P as doSkipA2P } from "@/lib/a2p";
import type { A2PBusinessInfo } from "@/lib/integrations/twilio";

async function ownerShop(userId: string) {
  const shop = await prisma.shop.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: "asc" }, include: { run: true } });
  if (!shop?.run) throw new Error("No setup in progress.");
  return shop;
}

// --- test_agent -----------------------------------------------------------
/** Start an in-browser web call to the shop's agent (no phone needed). */
export async function startWebCall(): Promise<{ accessToken: string } | { error: string }> {
  const user = await requireUser();
  const { rateLimit } = await import("@/lib/ratelimit");
  if (!(await rateLimit("webcall", user.id))) return { error: "Too many test calls — please wait a minute." };
  const shop = await ownerShop(user.id);
  if (!shop.agentId || shop.agentProvider !== "retell") {
    return { error: "Your receptionist isn't ready for a web call yet." };
  }
  if (!process.env.RETELL_API_KEY) {
    return { error: "Voice isn't fully configured yet." };
  }
  try {
    const { createWebCall } = await import("@/lib/integrations/retell");
    const { accessToken } = await createWebCall(shop.agentId);
    return { accessToken };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function approveTestAgent() {
  const user = await requireUser();
  const shop = await ownerShop(user.id);
  await logAudit(shop.id, user.id, "test_agent.approved", {});
  await completeUserStep(shop.run!.id, "test_agent", { approved: true });
  redirect("/app/go-live");
}

export async function reportTestProblem(note: string) {
  const user = await requireUser();
  const shop = await ownerShop(user.id);
  await prisma.provisioningStep.update({
    where: { runId_key: { runId: shop.run!.id, key: "test_agent" } },
    data: { result: { approved: false, note } as never },
  });
  await notifyAdmins("Owner reported a problem on the test call", `Shop: ${shop.businessName} (${shop.id})\nNote: ${note}`);
  await logAudit(shop.id, user.id, "test_agent.problem", { note });
  // Stays paused on this step until support/owner resolves it.
}

// --- forwarding -----------------------------------------------------------
export async function chooseCarrier(carrier: string) {
  const user = await requireUser();
  const shop = await ownerShop(user.id);
  await setCarrier(shop.id, carrier);
}

export async function beginForwardingVerification() {
  const user = await requireUser();
  const { rateLimit } = await import("@/lib/ratelimit");
  if (!(await rateLimit("verify", user.id))) return { started: false, message: "Too many attempts — please wait a minute." };
  const shop = await ownerShop(user.id);
  return startVerification(shop.id);
}

export async function pollForwarding() {
  const user = await requireUser();
  const shop = await ownerShop(user.id);
  return getForwardingState(shop.id);
}

/** DEV ONLY — simulate the forwarded call reaching the agent. */
export async function simulateForwarded() {
  if (process.env.NODE_ENV === "production") throw new Error("Not available.");
  const user = await requireUser();
  const shop = await ownerShop(user.id);
  await markVerified(shop.id, user.id);
  redirect("/app/go-live");
}

// --- a2p ------------------------------------------------------------------
export async function submitA2PInfo(info: A2PBusinessInfo) {
  const user = await requireUser();
  const shop = await ownerShop(user.id);
  await doSubmitA2P(shop.id, info);
  redirect("/app/go-live");
}

export async function skipTexting() {
  const user = await requireUser();
  const shop = await ownerShop(user.id);
  await doSkipA2P(shop.id);
  redirect("/app/go-live");
}
