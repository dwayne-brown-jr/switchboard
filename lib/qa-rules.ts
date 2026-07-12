import type { ShopConfig, QaFlag } from "./schemas";

// ===========================================================================
// The DETERMINISTIC QA backbone. Pure, dependency-free (no server-only, no
// Anthropic) so it can never be skipped and can be unit-tested in isolation.
// qaReview() in llm.ts calls this first, then the LLM may only *add* advisory
// flags — it can never clear a critical finding produced here.
// ===========================================================================

export function prettyField(f: string): string {
  return f.replace(/_/g, " ");
}

export function looksLikeExactPrice(range: string): boolean {
  const r = range.trim();
  if (!r) return false;
  const hasRange = /[–-]|to\b|\bstarting\b|\bfrom\b|\+|\bup to\b/i.test(r);
  const hasNumber = /\d/.test(r);
  return hasNumber && !hasRange;
}

export interface DeterministicQa {
  /** true when at least one blocking rule failed → verdict must be "no_go". */
  critical: boolean;
  flags: QaFlag[];
}

/**
 * Run every deterministic safety rule. `critical` gates go-live; advisory
 * findings (e.g. no FAQ answers) are added to `flags` without setting it.
 */
export function deterministicQa(prompt: string, config: ShopConfig): DeterministicQa {
  const flags: QaFlag[] = [];
  let critical = false;

  // 1. Timezone ambiguity — hours are meaningless without it.
  if (!config.city) {
    flags.push({ risk: "We don't know your city, so hours and service area could be confusing.", fix: "Add your city." });
    critical = true;
  }

  // 2. Escalation coverage.
  if (!config.escalation.alert_number) {
    flags.push({
      risk: "There's no phone number to alert you about emergencies.",
      fix: "Add the number the receptionist should text/call for urgent jobs.",
    });
    critical = true;
  }
  if (config.hot_job_rules.length === 0) {
    flags.push({
      risk: "No emergency situations are listed, so urgent calls might not be flagged.",
      fix: "Turn on the emergency situations that matter for your shop.",
    });
    critical = true;
  }

  // 3. Prices quotable too precisely.
  for (const [service, range] of Object.entries(config.price_ranges)) {
    if (looksLikeExactPrice(range)) {
      flags.push({
        risk: `The price for "${service}" is a single exact amount (${range}). Your receptionist should never promise an exact price.`,
        fix: `Use a range like "$45–$90" for "${service}", or leave it blank.`,
      });
      critical = true;
    }
  }

  // 4. Bookable service present.
  if (!config.services.some((s) => s.bookable)) {
    flags.push({ risk: "No services are marked bookable, so the receptionist can't book anything.", fix: "Mark at least one service as bookable." });
    critical = true;
  }

  // 5. Booking fields the calendar needs but the prompt doesn't collect.
  for (const field of config.booking_fields) {
    if (!prompt.toLowerCase().includes(prettyField(field).toLowerCase()) && !prompt.toLowerCase().includes(field.toLowerCase())) {
      flags.push({
        risk: `The booking detail "${prettyField(field)}" isn't being collected on calls.`,
        fix: "This is usually automatic — if you see this, contact support.",
      });
      critical = true;
    }
  }

  // 6. FAQ coverage (advisory — doesn't block).
  const answered = config.faqs.filter((f) => f.a.trim()).length;
  if (answered === 0) {
    flags.push({
      risk: "None of your common questions have answers yet, so the receptionist will take a message instead of answering them.",
      fix: "Add short answers to a few common questions (like walk-ins or service fees).",
    });
  }

  return { critical, flags };
}
