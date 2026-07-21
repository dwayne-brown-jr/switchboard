import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";
import { Logo } from "@/components/logo";

// Double-gated (ADMIN_EMAILS env allowlist OR User.isAdmin) via requireAdmin.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <div className="min-h-full">
      <header className="border-b border-slate-800 bg-slate-900 text-slate-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="flex items-center gap-2 font-semibold">
              <Logo className="h-7 w-7" />
              Switchboard <span className="text-slate-400">Operator</span>
            </Link>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/app" className="text-slate-400 hover:text-white">
              Owner view
            </Link>
            <span className="hidden text-slate-500 sm:inline">{user.email}</span>
            <SignOutButton className="text-sm text-slate-400 hover:text-white" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
