import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getSession();
  if (session?.user) redirect("/app");

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-semibold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">S</span>
          Switchboard
        </Link>
        <div className="card p-7">
          <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600">
            Enter your email and we&apos;ll send you a secure sign-in link. No password to remember.
          </p>
          <div className="mt-6">
            <LoginForm googleEnabled={!!process.env.GOOGLE_CLIENT_ID} />
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          By continuing you agree to receive setup and account emails from Switchboard.
        </p>
      </div>
    </div>
  );
}
