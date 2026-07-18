import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoLoginEnabled } from "@/lib/demo-login";
import { signInDemo } from "./actions";

export const metadata = {
  title: "Reviewer demo — Switchboard",
  // Never index a sign-in surface.
  robots: { index: false, follow: false },
};

// Always evaluated per request: the page must disappear the moment the demo env
// vars are cleared, without a redeploy.
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  bad: "That code isn't right.",
  slow: "Too many attempts. Give it a few minutes.",
  retry: "Couldn't start the demo session. Try once more.",
  off: "Demo access is currently turned off.",
};

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // 404 (not a friendly "disabled" page) when unconfigured — don't advertise
  // that a demo door exists in environments that never set it up.
  if (!isDemoLoginEnabled()) notFound();

  const { error } = await searchParams;
  const message = error ? (ERRORS[error] ?? ERRORS.bad) : null;

  return (
    <div className="grid min-h-full place-items-center bg-slate-50 px-6 py-20">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center justify-center gap-2 font-display font-bold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">S</span>
          Switchboard
        </Link>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="font-display text-xl font-bold text-slate-900">Reviewer access</h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-600">
            Enter the code you were given to open a sample shop&apos;s dashboard. The data is generated for
            review — no real customers or calls.
          </p>

          <form action={signInDemo} className="mt-5">
            <label htmlFor="code" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Access code
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              required
              placeholder="••••••"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center font-display text-2xl font-bold tracking-[0.3em] text-slate-900 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-200"
            />
            {message && <p className="mt-2 text-sm font-medium text-red-600">{message}</p>}
            <button type="submit" className="btn-accent mt-4 w-full justify-center">
              Open the demo
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Sample data only. Not a customer account.
        </p>
      </div>
    </div>
  );
}
