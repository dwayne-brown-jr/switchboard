"use client";

import { useState, useTransition } from "react";
import { pauseShop, resumeShop } from "./dashboard-actions";

export function PauseSwitch({ shopId, paused }: { shopId: string; paused: boolean }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

  if (paused) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="font-medium text-amber-900">Your receptionist is paused</p>
        <p className="mt-1 text-sm text-amber-700">Calls aren&apos;t being answered. Remember to remove call forwarding while paused.</p>
        <button className="btn-primary mt-3" disabled={pending} onClick={() => start(() => resumeShop(shopId))}>
          {pending ? "Resuming…" : "Resume receptionist"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <p className="text-sm font-medium text-slate-800">Receptionist is active</p>
        <p className="text-xs text-slate-500">Answering your calls right now.</p>
      </div>
      {confirm ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Pause it?</span>
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setConfirm(false)}>
            No
          </button>
          <button
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            disabled={pending}
            onClick={() => start(() => pauseShop(shopId))}
          >
            {pending ? "Pausing…" : "Yes, pause"}
          </button>
        </div>
      ) : (
        <button className="btn-secondary" onClick={() => setConfirm(true)}>
          Pause
        </button>
      )}
    </div>
  );
}
