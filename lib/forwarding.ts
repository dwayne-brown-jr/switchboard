import { prisma } from "./db";
import { placeCall } from "./integrations/twilio";
import { scheduleJob } from "./qstash";
import { advanceRun, completeUserStep } from "./engine";
import { logAudit } from "./audit";

// Forwarding verification. We place an outbound call to the shop's business
// line and tell the owner NOT to answer. If no-answer forwarding is configured,
// that call lands on the agent number, the agent answers, and when that call
// ends its call-events webhook (recordCall) marks the step verified — see the
// forwarding self-verify hook in lib/ingest.ts. (The old n8n → /api/verify/
// forwarding callback is gone; the app is the broker now.) A QStash job times
// the attempt out if no forwarded call is detected.
//
// The window must cover the full round trip: no-answer ring (~20-30s) + the
// agent call (~20s of verify TwiML) + the call-ENDED webhook delay. It's kept
// a bit larger than the timeout so a call that lands just before the timeout
// still counts.
const WINDOW_MS = 165_000;

type ForwardResult = {
  status: "idle" | "verifying" | "verified" | "failed";
  startedAt?: string;
  callSid?: string;
  carrier?: string;
  message?: string;
};

async function getForwardingStep(shopId: string) {
  const run = await prisma.onboardingRun.findUnique({ where: { shopId } });
  if (!run) return null;
  const step = await prisma.provisioningStep.findUnique({ where: { runId_key: { runId: run.id, key: "forwarding" } } });
  return step ? { run, step } : null;
}

/** Save the owner's selected carrier (for instructions + admin context). */
export async function setCarrier(shopId: string, carrier: string) {
  const found = await getForwardingStep(shopId);
  if (!found) return;
  const prev = (found.step.result as ForwardResult | null) ?? { status: "idle" };
  await prisma.provisioningStep.update({
    where: { id: found.step.id },
    data: { result: { ...prev, carrier } as never },
  });
}

/** Begin a verification attempt: place the outbound call and start the clock. */
export async function startVerification(shopId: string): Promise<{ started: boolean; message?: string }> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  const found = await getForwardingStep(shopId);
  if (!shop || !found) return { started: false, message: "Setup not ready." };
  if (!shop.businessNumber || !shop.agentNumber) return { started: false, message: "Missing phone numbers." };

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const carrier = (found.step.result as ForwardResult | null)?.carrier;
  let callSid = "pending";
  try {
    const call = await placeCall(shop.businessNumber, shop.agentNumber, `${appUrl}/api/twiml/verify-call`);
    callSid = call.sid;
  } catch (e) {
    return { started: false, message: `Could not place the test call: ${(e as Error).message}` };
  }

  await prisma.provisioningStep.update({
    where: { id: found.step.id },
    data: { result: { status: "verifying", startedAt: new Date().toISOString(), callSid, carrier } as never },
  });
  // Time the attempt out if no forwarded call is detected in time.
  await scheduleJob("/api/jobs/forwarding-timeout", { shopId }, 150);
  return { started: true };
}

/** Called when the agent receives the forwarded call (correlation success). */
export async function markVerified(shopId: string, actorId?: string): Promise<boolean> {
  const found = await getForwardingStep(shopId);
  if (!found) return false;
  const result = (found.step.result as ForwardResult | null) ?? { status: "idle" };
  if (found.step.status === "done") return true;
  // Only accept within the window of an active attempt (dev simulate bypasses time check via actorId).
  if (!actorId) {
    if (result.status !== "verifying" || !result.startedAt) return false;
    if (Date.now() - new Date(result.startedAt).getTime() > WINDOW_MS) return false;
  }
  await logAudit(shopId, actorId ?? null, "forwarding.verified", { carrier: result.carrier });
  await completeUserStep(found.run.id, "forwarding", { ...result, status: "verified" });
  return true;
}

/** QStash timeout callback — mark the attempt failed if still verifying. */
export async function markTimedOut(shopId: string) {
  const found = await getForwardingStep(shopId);
  if (!found) return;
  const result = (found.step.result as ForwardResult | null) ?? { status: "idle" };
  if (found.step.status === "done" || result.status !== "verifying") return;
  await prisma.provisioningStep.update({
    where: { id: found.step.id },
    data: { result: { ...result, status: "failed", message: "We didn't detect a forwarded call in time." } as never },
  });
}

/** Admin override for odd phone systems. */
export async function adminMarkVerified(shopId: string) {
  const found = await getForwardingStep(shopId);
  if (!found) return;
  await logAudit(shopId, null, "forwarding.admin_override", {});
  await completeUserStep(found.run.id, "forwarding", { status: "verified", override: true });
}

export async function getForwardingState(shopId: string): Promise<ForwardResult & { done: boolean }> {
  const found = await getForwardingStep(shopId);
  if (!found) return { status: "idle", done: false };
  const result = (found.step.result as ForwardResult | null) ?? { status: "idle" };
  return { ...result, done: found.step.status === "done" };
}

// re-exported for the API route to avoid a duplicate import path
export { advanceRun };
