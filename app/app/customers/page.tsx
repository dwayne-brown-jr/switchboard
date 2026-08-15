import Link from "next/link";
import { getCurrentShop } from "@/lib/shop";
import { listCustomers, customerStageCounts, formatCents, formatPhone, STAGES, type SortKey, type Stage } from "@/lib/customers";

export const metadata = { title: "Customers · Switchboard" };

const STAGE_CHIP: Record<string, string> = {
  lead: "bg-slate-100 text-slate-600",
  active: "bg-green-100 text-green-700",
  dormant: "bg-amber-100 text-amber-700",
  lost: "bg-slate-100 text-slate-400",
};

const PAGE_SIZE = 50;

// `searchParams` is a PROMISE in this version of Next — it must be awaited
// before any property is read. Destructuring it synchronously silently yields
// undefined for every filter.
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; sort?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const shop = await getCurrentShop();

  if (!shop) {
    return (
      <div className="py-10 text-center text-slate-500">
        Set up your receptionist first.{" "}
        <Link href="/app" className="text-brand-600 hover:underline">
          Go to setup →
        </Link>
      </div>
    );
  }

  const q = sp.q?.trim() ?? "";
  const stage = (STAGES as string[]).includes(sp.stage ?? "") ? (sp.stage as Stage) : "all";
  const sort = (["recent", "value", "calls", "name"].includes(sp.sort ?? "") ? sp.sort : "recent") as SortKey;
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ rows, total }, counts] = await Promise.all([
    listCustomers(shop.id, { search: q, stage, sort, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    customerStageCounts(shop.id),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q, stage, sort, page, ...over };
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || v === "all" || (k === "page" && v === 1) || (k === "sort" && v === "recent")) continue;
      p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `/app/customers?${s}` : "/app/customers";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/app" className="text-sm text-slate-500 hover:text-slate-800">
            ← Back to dashboard
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">
            Everyone who has called {shop.businessName}. Built automatically from your calls — you never have to enter anyone.
          </p>
        </div>
      </div>

      {/* Search + sort. A plain GET form so it works without client JS. */}
      <form method="GET" className="flex flex-wrap items-center gap-2">
        {stage !== "all" && <input type="hidden" name="stage" value={stage} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search name or phone number…"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <select
          name="sort"
          defaultValue={sort}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none"
        >
          <option value="recent">Most recent</option>
          <option value="value">Highest value</option>
          <option value="calls">Most calls</option>
          <option value="name">Name A–Z</option>
        </select>
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          Search
        </button>
        {(q || stage !== "all" || sort !== "recent") && (
          <Link href="/app/customers" className="text-sm text-slate-500 hover:text-slate-800">
            Clear
          </Link>
        )}
      </form>

      {/* Stage filters */}
      <div className="flex flex-wrap gap-2">
        {(["all", ...STAGES] as const).map((s) => (
          <Link
            key={s}
            href={qs({ stage: s, page: 1 })}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
              stage === s ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {s} {counts[s] != null && <span className="opacity-60">{counts[s]}</span>}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center">
          <p className="text-sm text-slate-500">
            {q || stage !== "all" ? "No customers match that." : "No customers yet — they appear here as calls come in."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Stage</th>
                  <th className="px-4 py-2.5 text-right font-medium">Calls</th>
                  <th className="px-4 py-2.5 text-right font-medium">Jobs</th>
                  <th className="px-4 py-2.5 text-right font-medium">Value</th>
                  <th className="px-4 py-2.5 text-right font-medium">Last heard</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => (
                  <tr key={c.id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/app/customers/${c.id}`} className="block">
                        <span className="font-medium text-slate-900">{c.displayName ?? formatPhone(c.phone)}</span>
                        {c.displayName && <span className="ml-2 text-xs text-slate-400">{formatPhone(c.phone)}</span>}
                        {c.tags.length > 0 && (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {c.tags.map((t) => (
                              <span key={t} className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700">
                                {t}
                              </span>
                            ))}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STAGE_CHIP[c.stage] ?? STAGE_CHIP.lead}`}>{c.stage}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{c.callCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{c.bookingCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {c.lifetimeValue > 0 ? formatCents(c.lifetimeValue) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {c.lastContactAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs({ page: page - 1 })} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={qs({ page: page + 1 })} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                Next
              </Link>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Value is what these jobs were worth. Where a job hasn&apos;t been closed out yet it&apos;s your receptionist&apos;s estimate from the
        call, not billed revenue — open a customer to enter the real number.
      </p>
    </div>
  );
}
