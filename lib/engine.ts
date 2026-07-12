import { prisma } from "./db";
import { PIPELINE, STEP_ORDER } from "./pipeline";
import { AUTO_HANDLERS } from "./steps";
import type { StepContext } from "./steps/types";
import { notifyAdminStepFailed } from "./notify";

// ---------------------------------------------------------------------------
// The engine: a linear state machine over PIPELINE. advanceRun runs auto steps
// in order until it hits a user step (pause) or a failure (pause + notify).
// Every auto handler is idempotent, so advanceRun is safe to call repeatedly.
// ---------------------------------------------------------------------------

/** Seed a run and all its steps for a shop. Idempotent-ish: no-op if a run
 *  already exists for the shop. */
export async function createRun(shopId: string) {
  const existing = await prisma.onboardingRun.findUnique({ where: { shopId } });
  if (existing) return existing;

  const run = await prisma.onboardingRun.create({
    data: { shopId, status: "in_progress", currentStep: "wizard" },
  });
  await prisma.provisioningStep.createMany({
    data: PIPELINE.map((s) => ({
      runId: run.id,
      key: s.key,
      type: s.type,
      // account is already satisfied (they're signed in); wizard starts active.
      status: s.key === "account" ? "done" : s.key === "wizard" ? "waiting_user" : "pending",
    })),
  });
  return run;
}

/** Mark a user step complete and advance the run. Used when the owner finishes
 *  the wizard or any other user task. */
export async function completeUserStep(runId: string, key: string, result?: unknown) {
  await prisma.provisioningStep.update({
    where: { runId_key: { runId, key } },
    data: { status: "done", result: (result as never) ?? undefined },
  });
  return advanceRun(runId);
}

/** Save wizard progress without completing the step (resumable). */
export async function saveWizardProgress(runId: string, data: unknown) {
  await prisma.provisioningStep.update({
    where: { runId_key: { runId, key: "wizard" } },
    data: { result: data as never },
  });
}

export async function advanceRun(runId: string) {
  const run = await prisma.onboardingRun.findUnique({
    where: { id: runId },
    include: { steps: true, shop: true },
  });
  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.status === "live") return run;

  const steps = [...run.steps].sort((a, b) => (STEP_ORDER[a.key] ?? 99) - (STEP_ORDER[b.key] ?? 99));

  for (const step of steps) {
    if (step.status === "done" || step.status === "skipped") continue;

    // Reached a user step that isn't done — pause and wait for the owner.
    if (step.type === "user") {
      await prisma.provisioningStep.update({
        where: { id: step.id },
        data: { status: "waiting_user" },
      });
      await prisma.onboardingRun.update({
        where: { id: run.id },
        data: { status: "waiting_user", currentStep: step.key },
      });
      return prisma.onboardingRun.findUnique({ where: { id: run.id }, include: { steps: true } });
    }

    // Auto step — run its handler.
    const handler = AUTO_HANDLERS[step.key];
    if (!handler) {
      await markFailed(step.id, run.id, step.key, `No handler registered for "${step.key}"`);
      return getRun(run.id);
    }

    await prisma.provisioningStep.update({
      where: { id: step.id },
      data: { status: "running", attempts: { increment: 1 } },
    });
    await prisma.onboardingRun.update({ where: { id: run.id }, data: { currentStep: step.key } });

    const ctx: StepContext = { shop: run.shop, run, step };
    let result;
    try {
      result = await handler(ctx);
    } catch (e) {
      await markFailed(step.id, run.id, step.key, (e as Error).message);
      return getRun(run.id);
    }

    if (result.ok) {
      await prisma.provisioningStep.update({
        where: { id: step.id },
        data: { status: "done", result: (result.data as never) ?? undefined },
      });
      continue; // proceed to next step
    }

    if (result.kind === "needs_user") {
      // Owner has to fix/provide something. Pause the run on this step.
      await prisma.provisioningStep.update({
        where: { id: step.id },
        data: { status: "waiting_user", result: { message: result.message, ...(result.data as object) } as never },
      });
      await prisma.onboardingRun.update({
        where: { id: run.id },
        data: { status: "waiting_user", currentStep: step.key },
      });
      return getRun(run.id);
    }

    // error
    await markFailed(step.id, run.id, step.key, result.message, result.data);
    return getRun(run.id);
  }

  // All steps done → live.
  await prisma.onboardingRun.update({
    where: { id: run.id },
    data: { status: "live", currentStep: null, completedAt: new Date() },
  });
  return getRun(run.id);
}

async function markFailed(stepId: string, runId: string, key: string, message: string, data?: unknown) {
  await prisma.provisioningStep.update({
    where: { id: stepId },
    data: { status: "failed", result: { error: message, ...(data as object) } as never },
  });
  await prisma.onboardingRun.update({ where: { id: runId }, data: { currentStep: key } });
  await notifyAdminStepFailed({ runId, key, message });
  const { reportError } = await import("./observability");
  await reportError(new Error(message), { source: "provisioning", route: `step:${key}`, extra: { runId, key, data } });
}

function getRun(runId: string) {
  return prisma.onboardingRun.findUnique({ where: { id: runId }, include: { steps: true } });
}

/** Retry a failed/paused auto step from the admin panel. Resets it to pending
 *  and re-advances. Idempotent handlers make this safe. */
export async function retryStep(runId: string, key: string) {
  await prisma.provisioningStep.update({
    where: { runId_key: { runId, key } },
    data: { status: "pending" },
  });
  await prisma.onboardingRun.update({ where: { id: runId }, data: { status: "in_progress" } });
  return advanceRun(runId);
}
