"use client";

import { useTransition } from "react";
import { rollbackSettings } from "./actions";

export function RollbackButton({ versionId }: { versionId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      disabled={pending}
      onClick={() => start(() => rollbackSettings(versionId).then(() => {}))}
    >
      {pending ? "Rolling back…" : "Roll back to this"}
    </button>
  );
}
