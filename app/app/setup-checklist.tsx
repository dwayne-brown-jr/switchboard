import Link from "next/link";
import { PIPELINE } from "@/lib/pipeline";
import type { ProvisioningStep } from "@prisma/client";

// Renders the owner's setup checklist directly from their onboarding run.
// Owner-facing steps only — the technical auto-steps are collapsed into the
// friendly "Build your receptionist" group so the list reads like a to-do list.
const OWNER_STEPS = [
  // "account" is always done — the list deliberately never starts at zero.
  { key: "account", label: "Create your account" },
  { key: "wizard", label: "Tell us about your shop" },
  { key: "generate_config", label: "Build & quality-check your receptionist", groupWith: ["generate_prompt", "qa_review", "provision_voice"] },
  { key: "subscribe", label: "Hear it & start your subscription" },
  { key: "provision_calendar", label: "We set everything up", groupWith: ["provision_number", "register_pipeline"] },
  { key: "test_agent", label: "Give it a test call" },
  { key: "forwarding", label: "Forward your calls" },
  { key: "a2p", label: "Turn on texting (background)" },
  { key: "go_live", label: "Go live" },
] as const;

type StepMap = Record<string, ProvisioningStep>;

function groupStatus(map: StepMap, keys: string[]): ProvisioningStep["status"] {
  const statuses = keys.map((k) => map[k]?.status ?? "pending");
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("running")) return "running";
  if (statuses.includes("waiting_user")) return "waiting_user";
  if (statuses.every((s) => s === "done" || s === "skipped")) return "done";
  return "pending";
}

export function SetupChecklist({ steps }: { steps: ProvisioningStep[] }) {
  const map: StepMap = Object.fromEntries(steps.map((s) => [s.key, s]));

  const items = OWNER_STEPS.map((item) => {
    const keys = [item.key, ...(("groupWith" in item && item.groupWith) || [])];
    return { ...item, status: groupStatus(map, keys) };
  });
  const doneCount = items.filter((i) => i.status === "done").length;
  const pct = Math.round((doneCount / items.length) * 100);

  return (
    <div className="card p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Your setup checklist</h2>
        <span className="text-sm font-medium text-brand-700">
          {doneCount} of {items.length} done
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      <p className="mt-2 text-sm text-slate-500">A few steps and your receptionist is live.</p>
      <ol className="mt-5 space-y-1">
        {items.map((item) => {
          const isPhase2 = PIPELINE.find((p) => p.key === item.key)?.phase === 2;
          return <ChecklistItem key={item.key} label={item.label} status={item.status} stepKey={item.key} isPhase2={isPhase2} />;
        })}
      </ol>
    </div>
  );
}

function ChecklistItem({
  label,
  status,
  stepKey,
  isPhase2,
}: {
  label: string;
  status: ProvisioningStep["status"];
  stepKey: string;
  isPhase2: boolean;
}) {
  const icon =
    status === "done"
      ? "✓"
      : status === "failed"
        ? "!"
        : status === "running"
          ? "…"
          : status === "waiting_user"
            ? "→"
            : "";
  const tone =
    status === "done"
      ? "bg-green-500 text-white"
      : status === "failed"
        ? "bg-red-500 text-white"
        : status === "waiting_user"
          ? "bg-brand-600 text-white"
          : status === "running"
            ? "bg-brand-100 text-brand-700"
            : "bg-slate-100 text-slate-300";

  const active = status === "waiting_user";

  return (
    <li className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${active ? "bg-brand-50" : ""}`}>
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${tone}`}>{icon}</span>
      <span className={`flex-1 text-sm ${status === "done" ? "text-slate-500" : "text-slate-800"}`}>{label}</span>
      {active && stepKey === "wizard" && (
        <Link href="/app/setup" className="btn-primary px-3 py-1.5 text-xs">
          Continue
        </Link>
      )}
      {active && stepKey === "subscribe" && (
        <Link href="/app/subscribe" className="btn-primary px-3 py-1.5 text-xs">
          Choose plan
        </Link>
      )}
      {active && (stepKey === "test_agent" || stepKey === "forwarding" || stepKey === "a2p") && (
        <Link href="/app/go-live" className="btn-primary px-3 py-1.5 text-xs">
          Continue
        </Link>
      )}
      {status === "failed" && <span className="text-xs text-red-500">We&apos;re on it</span>}
      {status === "pending" && isPhase2 && <span className="text-xs text-slate-300">Coming up</span>}
    </li>
  );
}
