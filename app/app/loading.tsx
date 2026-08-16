// Shown while any /app page's server data is in flight.
//
// Before this existed every owner page rendered nothing until all of its
// queries resolved — the dashboard waits on three in parallel — so a slow
// connection looked like a broken app rather than a loading one.
//
// A skeleton rather than a spinner: it holds the shape of the page, so content
// arriving doesn't shove the layout around.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-7 w-56 rounded bg-slate-200" />
        <div className="h-4 w-72 rounded bg-slate-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="h-3 w-20 rounded bg-slate-100" />
            <div className="mt-3 h-6 w-16 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <div className="h-4 w-32 rounded bg-slate-200" />
        </div>
        <div className="space-y-3 p-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 w-full rounded bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
