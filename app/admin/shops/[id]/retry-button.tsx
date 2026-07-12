"use client";

import { useTransition } from "react";
import { retryStepAction, advanceRunAction, seedCallsAction, clearCallsAction, forwardingOverrideAction, sendDigestAction, pauseShopAdminAction } from "../../actions";

export function RetryButton({ runId, stepKey }: { runId: string; stepKey: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      disabled={pending}
      onClick={() => start(() => retryStepAction(runId, stepKey))}
    >
      {pending ? "Retrying…" : "Retry"}
    </button>
  );
}

export function AdvanceButton({ runId }: { runId: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn-secondary" disabled={pending} onClick={() => start(() => advanceRunAction(runId))}>
      {pending ? "Advancing…" : "Advance run"}
    </button>
  );
}

export function SeedCallsButtons({ shopId }: { shopId: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <button className="btn-secondary" disabled={pending} onClick={() => start(() => seedCallsAction(shopId))}>
        {pending ? "Working…" : "Seed 40 sample calls"}
      </button>
      <button className="btn-ghost" disabled={pending} onClick={() => start(() => clearCallsAction(shopId))}>
        Clear sample calls
      </button>
    </div>
  );
}

export function ShopOpsButtons({ shopId }: { shopId: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn-secondary" disabled={pending} onClick={() => start(() => sendDigestAction(shopId))}>
        {pending ? "Working…" : "Send weekly digest now"}
      </button>
      <button className="btn-ghost" disabled={pending} onClick={() => start(() => pauseShopAdminAction(shopId))}>
        Pause this shop
      </button>
    </div>
  );
}

export function ForwardingOverrideButton({ shopId }: { shopId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      disabled={pending}
      onClick={() => start(() => forwardingOverrideAction(shopId))}
    >
      {pending ? "…" : "Mark forwarding verified"}
    </button>
  );
}
