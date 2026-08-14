// Stub for the `server-only` marker package under vitest.
//
// `server-only` isn't a real dependency — Next.js resolves it during the build
// to make importing a server module from a client component a hard error.
// Outside that build there is nothing to resolve, so any lib guarded with
// `import "server-only"` is unimportable from a test.
//
// Until now the repo worked around that by keeping testable libs free of the
// guard on purpose (see the comments in lib/capacity.ts, lib/slo.ts,
// lib/public-demo.ts) — which meant the ~20 libs that genuinely need it, the
// ones touching the database and secrets, were the ones that couldn't be
// tested. Aliasing it here inverts that: the production guard stays exactly as
// strict, and the modules that most need coverage become reachable.
export {};
