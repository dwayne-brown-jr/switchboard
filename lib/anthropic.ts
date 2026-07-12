import Anthropic from "@anthropic-ai/sdk";
import "server-only";

const apiKey = process.env.ANTHROPIC_API_KEY;

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
export const QA_MODEL = process.env.ANTHROPIC_QA_MODEL || "claude-opus-4-8";

const client = apiKey ? new Anthropic({ apiKey }) : null;

/** Whether a real Anthropic key is configured. When false, callers fall back
 *  to deterministic local logic so the flow still works end-to-end. */
export function hasAnthropic(): boolean {
  return client !== null;
}

interface CompleteArgs {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}

/** Single-turn completion. Throws if no key — callers guard with hasAnthropic(). */
export async function complete({ system, prompt, model, maxTokens = 2048 }: CompleteArgs): Promise<string> {
  if (!client) throw new Error("ANTHROPIC_API_KEY not configured");
  const res = await client.messages.create({
    model: model || MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Extracts the first JSON object/array from a model response, tolerating
 *  ```json fences and surrounding prose. Returns null if none parses. */
export function extractJson<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  // Try the whole candidate, then the first {...} or [...] span.
  const spans = [candidate.trim()];
  const objMatch = candidate.match(/[{[][\s\S]*[}\]]/);
  if (objMatch) spans.push(objMatch[0]);
  for (const s of spans) {
    try {
      return JSON.parse(s) as T;
    } catch {
      /* try next */
    }
  }
  return null;
}
