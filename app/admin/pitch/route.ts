import { promises as fs } from "fs";
import path from "path";
import { requireAdmin } from "@/lib/session";

// Admin-only static sales-demo page. Reuses the existing operator gate
// (requireAdmin — ADMIN_EMAILS allowlist OR User.isAdmin) exactly like the rest
// of /admin; no new auth. The HTML lives at repo-root `private/` (NOT /public,
// so it's never publicly served) and is read at request time. force-dynamic so
// the guard runs on every hit and nothing is cached.
export const dynamic = "force-dynamic";

export async function GET() {
  // 1) Same double-gate as every other admin page. On failure this throws a
  //    redirect (→ /login when logged out, → /app for non-admins) BEFORE we ever
  //    touch the file, so the HTML is never served to a non-admin.
  await requireAdmin();

  // 2) Serve the demo file verbatim.
  const filePath = path.join(process.cwd(), "private", "pitch-demo.html");
  const html = await fs.readFile(filePath, "utf8");

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
