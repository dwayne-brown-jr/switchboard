import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/logo";

export default async function LoginPage() {
  const session = await getSession();
  if (session?.user) redirect("/app");

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-semibold text-slate-900">
          <Logo className="h-8 w-8" />
          Switchboard
        </Link>
        {/* Reached from "Get started" as often as from "Sign in", and with
            passwordless magic links both are the same action — so the copy has to
            serve a first-time visitor without confusing a returning owner. */}
        <div className="card p-7">
          <h1 className="text-xl font-semibold text-slate-900">Sign in or get started</h1>
          <p className="mt-1 text-sm text-slate-600">
            Enter your email and we&apos;ll send you a secure link. It works whether you&apos;re new or coming back —
            no password to remember.
          </p>
          <div className="mt-6">
            <LoginForm googleEnabled={!!process.env.GOOGLE_CLIENT_ID} />
          </div>
          <p className="mt-5 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500">
            New here? Setup takes about 10 minutes, and{" "}
            <span className="font-medium text-slate-700">you&apos;ll hear your receptionist before you pay</span> — no
            card needed to start.
          </p>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          By continuing you agree to receive setup and account emails from Switchboard.
        </p>
      </div>
    </div>
  );
}
