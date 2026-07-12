import type { Shop, OnboardingRun, ProvisioningStep } from "@prisma/client";

export interface StepContext {
  shop: Shop;
  run: OnboardingRun;
  step: ProvisioningStep;
}

/** Result an auto-step handler returns to the engine. */
export type StepResult =
  | { ok: true; data?: unknown } // done, continue to next step
  | { ok: false; kind: "needs_user"; message: string; data?: unknown } // pause, owner must act
  | { ok: false; kind: "error"; message: string; data?: unknown }; // failed, admin retryable

export type AutoHandler = (ctx: StepContext) => Promise<StepResult>;

export const done = (data?: unknown): StepResult => ({ ok: true, data });
export const needsUser = (message: string, data?: unknown): StepResult => ({ ok: false, kind: "needs_user", message, data });
export const failed = (message: string, data?: unknown): StepResult => ({ ok: false, kind: "error", message, data });
