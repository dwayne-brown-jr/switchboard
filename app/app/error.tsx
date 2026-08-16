"use client";

import { useEffect } from "react";
import Link from "next/link";

// Error boundary for the owner app.
//
// Without this a thrown server error showed Next's stock error screen — no
// branding, no way back, and nothing reported. The owner's read on that is
// "Switchboard is down", which for a product whose job is answering their phone
// is a much bigger fright than the bug usually warrants. So this says the part
// that actually matters: the receptionist is a separate system and is still
// picking up.
//
// `digest` is Next's hash of the server-side error; it's the only handle a
// support conversation has, since the real message is deliberately not sent to
// the browser.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The server side is already captured by instrumentation's onRequestError.
    // This logs the client's view so a browser-only failure isn't invisible.
    console.error("owner app error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
          <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>
      </div>
      <h1 className="mt-4 font-display text-xl font-bold text-slate-900">This page didn&apos;t load</h1>
      <p className="mt-2 text-sm text-slate-600">
        Something went wrong on our side. <strong className="font-medium text-slate-800">Your receptionist is unaffected</strong> — it runs
        separately and is still answering calls.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <button type="button" onClick={reset} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          Try again
        </button>
        <Link href="/app" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Back to dashboard
        </Link>
      </div>
      {error.digest && <p className="mt-4 text-xs text-slate-400">Reference: {error.digest}</p>}
    </div>
  );
}
