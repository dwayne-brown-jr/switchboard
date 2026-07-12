// Fuzzy-match a caller-named service to one of a set of known service names.
// Pure + dependency-free so it's shared by booking (event-type lookup) and
// call ingest (revenue-value lookup) and easily unit-tested.

/** Lowercase word tokens with a trailing plural "s" stripped. */
function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/s$/, ""));
}

/**
 * Match `service` to one of `keys`: exact → case-insensitive → unique
 * token-overlap (handles plurals, extra words, reordering — e.g. "routine oil
 * change for my BMW" → "Oil change"). Returns the matched key, or undefined
 * when there's no match or the best is ambiguous (a shared generic token like
 * "service" ties two keys), so callers never silently pick the wrong one.
 */
export function fuzzyMatchKey(keys: string[], service?: string | null): string | undefined {
  if (!service || !service.trim()) return undefined;
  if (keys.includes(service)) return service;
  const lc = service.trim().toLowerCase();
  const ci = keys.find((k) => k.toLowerCase() === lc);
  if (ci) return ci;

  const svc = new Set(tokens(service));
  let best: string | undefined;
  let bestScore = 0;
  let tie = false;
  for (const k of keys) {
    const score = tokens(k).filter((t) => svc.has(t)).length;
    if (score > bestScore) {
      bestScore = score;
      best = k;
      tie = false;
    } else if (score === bestScore && score > 0) {
      tie = true;
    }
  }
  return best && bestScore > 0 && !tie ? best : undefined;
}
