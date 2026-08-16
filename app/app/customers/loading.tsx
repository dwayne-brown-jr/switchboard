// Table-shaped skeleton for the customer pages, so a slow list doesn't render
// as a blank panel under a heading that's already there.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Loading customers">
      <div className="space-y-2">
        <div className="h-7 w-40 rounded bg-slate-200" />
        <div className="h-4 w-96 max-w-full rounded bg-slate-100" />
      </div>
      <div className="h-9 w-full rounded-lg bg-slate-100" />
      <div className="flex gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-6 w-16 rounded-full bg-slate-100" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="h-9 border-b border-slate-200 bg-slate-50" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-0">
            <div className="h-4 flex-1 rounded bg-slate-100" />
            <div className="h-4 w-24 rounded bg-slate-100" />
            <div className="h-4 w-16 rounded bg-slate-100" />
            <div className="h-4 w-14 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
