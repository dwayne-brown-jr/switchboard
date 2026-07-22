"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/** Sign out, then leave — whatever happens.
 *
 *  The previous version awaited signOut() with no catch and then used the
 *  client router. Two ways that fails silently, both of which look identical to
 *  the user: the button does nothing at all.
 *
 *  1. If signOut() rejects — offline, an ad blocker eating the request, an
 *     already-expired session — the await throws, the navigation lines never
 *     run, and the click is swallowed with no feedback.
 *  2. router.push() is a soft navigation, so the client router can serve a
 *     cached RSC payload for the dashboard afterwards, making it look like the
 *     session survived even when the cookie is gone.
 *
 *  So: always navigate, even if the request failed, and navigate hard.
 *  window.location wipes every client cache, which is what "sign out" should
 *  mean. If the request genuinely failed the session is still valid and the
 *  route guard sends them to /login — still a visible, honest outcome rather
 *  than a dead button. */
export function SignOutButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      className={className ?? "text-sm text-slate-500 hover:text-slate-800 disabled:opacity-60"}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await authClient.signOut();
        } catch (e) {
          // Never block the exit on a failed request.
          console.error("sign out request failed", e);
        } finally {
          window.location.href = "/";
        }
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
