import Link from "next/link";
import { requireUser } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const admin = isAdminEmail(user.email) || (user as { isAdmin?: boolean }).isAdmin === true;

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <Link href="/app" className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-sm text-white">S</span>
            Switchboard
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/app/settings" className="text-slate-500 hover:text-slate-800">
              Settings
            </Link>
            {admin && (
              <Link href="/admin" className="text-slate-500 hover:text-slate-800">
                Admin
              </Link>
            )}
            <span className="hidden text-slate-400 sm:inline">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
