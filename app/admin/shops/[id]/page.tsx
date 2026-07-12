import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { PIPELINE, STEP_ORDER } from "@/lib/pipeline";
import { RetryButton, AdvanceButton, SeedCallsButtons, ForwardingOverrideButton, ShopOpsButtons } from "./retry-button";

const STEP_TONE: Record<string, string> = {
  done: "bg-green-100 text-green-700",
  running: "bg-blue-100 text-blue-700",
  waiting_user: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-slate-100 text-slate-400",
  pending: "bg-slate-100 text-slate-400",
};

export default async function ShopDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const shop = await prisma.shop.findUnique({
    where: { id },
    include: {
      owner: true,
      run: { include: { steps: true } },
      versions: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!shop) notFound();

  const steps = (shop.run?.steps ?? []).sort((a, b) => (STEP_ORDER[a.key] ?? 99) - (STEP_ORDER[b.key] ?? 99));
  const latest = shop.versions[0];
  const callCount = await prisma.callRecord.count({ where: { shopId: shop.id } });
  const auditLogs = await prisma.auditLog.findMany({ where: { shopId: shop.id }, orderBy: { createdAt: "desc" }, take: 12 });

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-800">
          ← All shops
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{shop.businessName}</h1>
            <p className="text-sm text-slate-500">
              {shop.owner.email} · {shop.vertical} · <span className="font-mono text-xs">{shop.id}</span>
            </p>
          </div>
          {shop.run && <AdvanceButton runId={shop.run.id} />}
        </div>
      </div>

      {/* Run steps */}
      <section className="card p-5">
        <h2 className="mb-3 font-semibold text-slate-900">
          Onboarding run {shop.run ? <span className="text-sm font-normal text-slate-500">— {shop.run.status}</span> : ""}
        </h2>
        {shop.run ? (
          <div className="space-y-1.5">
            {steps.map((step) => {
              const def = PIPELINE.find((p) => p.key === step.key);
              const result = step.result as { error?: string; message?: string } | null;
              return (
                <div key={step.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2">
                  <span className={`w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${STEP_TONE[step.status]}`}>{step.status}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800">
                      {def?.title ?? step.key} <span className="font-mono text-xs text-slate-400">({step.key})</span>
                    </div>
                    {(result?.error || result?.message) && (
                      <div className="text-xs text-red-600">{result.error ?? result.message}</div>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">{step.type}</span>
                  <span className="text-xs text-slate-400">×{step.attempts}</span>
                  {step.type === "auto" && shop.run && (step.status === "failed" || step.status === "pending" || step.status === "done") && (
                    <RetryButton runId={shop.run.id} stepKey={step.key} />
                  )}
                  {step.key === "forwarding" && step.status !== "done" && <ForwardingOverrideButton shopId={shop.id} />}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No run yet.</p>
        )}
      </section>

      {/* Latest version: config + prompt + QA */}
      {latest && (
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Latest agent version</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${latest.qaVerdict === "go" ? "bg-green-100 text-green-700" : latest.qaVerdict === "no_go" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>
              QA: {latest.qaVerdict ?? "pending"} · {latest.status}
            </span>
          </div>
          {Array.isArray(latest.qaFlags) && latest.qaFlags.length > 0 && (
            <div className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              {(latest.qaFlags as { risk: string; fix: string }[]).map((f, i) => (
                <div key={i}>• {f.risk} → {f.fix}</div>
              ))}
            </div>
          )}
          <details className="mb-2">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">Config (JSON)</summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(latest.config, null, 2)}</pre>
          </details>
          <details>
            <summary className="cursor-pointer text-sm font-medium text-slate-700">System prompt</summary>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{latest.systemPrompt || "(empty)"}</pre>
          </details>
        </section>
      )}

      {/* Operator controls */}
      <section className="card p-5">
        <h2 className="mb-3 font-semibold text-slate-900">Operator controls</h2>
        <ShopOpsButtons shopId={shop.id} />
      </section>

      {/* Sample call data (for demoing the dashboard before n8n is wired). */}
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Call data</h2>
          <span className="text-sm text-slate-500">{callCount} records</span>
        </div>
        <SeedCallsButtons shopId={shop.id} />
      </section>

      {/* Audit log — who changed what, when. */}
      <section className="card p-5">
        <h2 className="mb-3 font-semibold text-slate-900">Audit log</h2>
        {auditLogs.length === 0 ? (
          <p className="text-sm text-slate-400">No activity yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {auditLogs.map((a) => (
              <li key={a.id} className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="font-mono text-xs text-slate-700">{a.action}</span>
                <span className="text-xs text-slate-400">{a.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
