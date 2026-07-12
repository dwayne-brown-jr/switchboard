// Best-effort client IP for rate-limit keys. Prefer x-real-ip (set by Vercel's
// edge and NOT client-controllable) over the leftmost x-forwarded-for value
// (which a client can spoof by prepending fake hops). Falls back to XFF only
// when x-real-ip is absent (non-Vercel / local dev).
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim() || "unknown";
  return "unknown";
}
