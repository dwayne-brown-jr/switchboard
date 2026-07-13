"use client";

import { useRef, useState } from "react";
import { startWebCall } from "@/app/app/go-live/actions";

// In-browser voice call to the owner's own receptionist — no phone number
// required. Used on the subscribe page (hear it before you pay) and on the
// go-live test wall.
export function WebCallButton({
  title = "Talk to your receptionist right here",
  subtitle = "No phone needed — we'll use your computer's mic and speaker.",
  liveHint = "Connected — say “I’d like to book an oil change.”",
}: {
  title?: string;
  subtitle?: string;
  liveHint?: string;
}) {
  const [state, setState] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [error, setError] = useState("");
  const clientRef = useRef<{ stopCall: () => void } | null>(null);

  async function start() {
    setError("");
    setState("connecting");
    try {
      const res = await startWebCall();
      if ("error" in res) {
        setState("error");
        setError(res.error);
        return;
      }
      const { RetellWebClient } = await import("retell-client-js-sdk");
      const client = new RetellWebClient();
      clientRef.current = client;
      client.on("call_started", () => setState("live"));
      client.on("call_ended", () => {
        setState("idle");
        clientRef.current = null;
      });
      client.on("error", (e: unknown) => {
        setError(String((e as { message?: string })?.message ?? e));
        setState("error");
        try {
          client.stopCall();
        } catch {}
      });
      await client.startCall({ accessToken: res.accessToken });
    } catch (e) {
      setState("error");
      setError((e as Error).message || "Could not start the call. Check microphone permission.");
    }
  }

  function stop() {
    clientRef.current?.stopCall();
    setState("idle");
  }

  return (
    <div className="rounded-xl bg-slate-900 p-5 text-white">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-slate-300">{subtitle}</p>
      {state === "live" ? (
        <button onClick={stop} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold hover:bg-red-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> End call
        </button>
      ) : (
        <button
          onClick={start}
          disabled={state === "connecting"}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-60"
        >
          🎙️ {state === "connecting" ? "Connecting…" : "Start web call"}
        </button>
      )}
      {state === "live" && <p className="mt-2 text-xs text-green-300">{liveHint}</p>}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
