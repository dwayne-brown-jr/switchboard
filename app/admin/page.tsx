import Link from "next/link";
import { prisma } from "@/lib/db";

const STATUS_TONE: Record<string, string> = {
  onboarding: "bg-blue-100 text-blue-700",
  live: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  canceled: "bg-slate-100 text-slate-500",
};

export default async function AdminHome() {
  const shops = await prisma.shop.findMany({
    orderBy: { createdAt: "desc" },
    include: { owner: true, run: { include: { steps: true } }, versions: true },
  });

  const failedSteps = await prisma.provisioningStep.findMany({
    where: { status: "failed" },
    include: { run: { include: { shop: true } } },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  const recentErrors = await prisma.failureEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Shops</h1>
        <p className="text-sm text-slate-500">{shops.length} total</p>
      </div>

      {failedSteps.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <h2 className="font-semibold text-red-800">Failures needing attention</h2>
          <ul className="mt-2 space-y-1 text-sm text-red-700">
            {failedSteps.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/shops/${s.run.shopId}`} className="underline">
                  {s.run.shop.businessName}
                </Link>{" "}
                — step <span className="font-mono">{s.key}</span> failed
              </li>
            ))}
          </ul>
        </div>
      )}

      {recentErrors.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-800">Recent errors</h2>
          <p className="text-xs text-slate-400">Latest {recentErrors.length} captured failures</p>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {recentErrors.map((e) => (
              <li key={e.id} className="flex items-baseline gap-3 py-1.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                    e.level === "warn" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                  }`}
                >
                  {e.source}
                </span>
                <span className="flex-1 text-slate-700">
                  {e.message}
                  {e.route ? <span className="ml-1 font-mono text-xs text-slate-400">{e.route}</span> : null}
                </span>
                <span className="whitespace-nowrap text-xs text-slate-400">{e.createdAt.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Shop</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Vertical</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Run</th>
              <th className="px-4 py-3">Versions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shops.map((shop) => (
              <tr key={shop.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/shops/${shop.id}`} className="font-medium text-brand-700 hover:underline">
                    {shop.businessName}
                  </Link>
                  <div className="font-mono text-xs text-slate-400">{shop.id}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{shop.owner.email}</td>
                <td className="px-4 py-3 text-slate-600">{shop.vertical}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[shop.status] ?? "bg-slate-100"}`}>{shop.status}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {shop.run ? (
                    <span>
                      {shop.run.status}
                      {shop.run.currentStep ? <span className="text-slate-400"> · {shop.run.currentStep}</span> : null}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{shop.versions.length}</td>
              </tr>
            ))}
            {shops.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No shops yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
