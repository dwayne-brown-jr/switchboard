// The self-serve pipeline definition. Order here IS the state-machine order.
// Each step has an owner-facing title/blurb used to render the setup checklist
// in plain language (never technical terms).

export type StepType = "auto" | "user";

export interface StepDef {
  key: string;
  type: StepType;
  /** Owner-facing checklist title. */
  title: string;
  /** Owner-facing one-line description. */
  blurb: string;
  /** Which phase implements the real handler (for admin clarity). */
  phase: 1 | 2 | 3;
}

export const PIPELINE: StepDef[] = [
  { key: "account", type: "user", title: "Create your account", blurb: "Sign in with your email.", phase: 1 },
  { key: "wizard", type: "user", title: "Tell us about your shop", blurb: "Answer a few questions so we can build your receptionist.", phase: 1 },
  { key: "generate_config", type: "auto", title: "Build your receptionist", blurb: "We turn your answers into a working receptionist.", phase: 1 },
  { key: "generate_prompt", type: "auto", title: "Teach it how to talk", blurb: "We give it your services, hours, and safety rules.", phase: 1 },
  { key: "qa_review", type: "auto", title: "Quality check", blurb: "We double-check everything before it can go live.", phase: 1 },
  // Voice is provisioned BEFORE the paywall on purpose: the owner gets to talk
  // to their own receptionist (in-browser web call) before picking a plan.
  // Creating the agent is free; the paid pieces (number, calendar) stay gated.
  { key: "provision_voice", type: "auto", title: "Give it a voice", blurb: "We set up the voice that answers your calls.", phase: 2 },
  { key: "subscribe", type: "user", title: "Start your subscription", blurb: "Pick a plan to activate your receptionist.", phase: 2 },
  { key: "provision_calendar", type: "auto", title: "Connect your calendar", blurb: "We set up your booking calendar.", phase: 2 },
  { key: "provision_number", type: "auto", title: "Get your phone number", blurb: "We get a local number for your receptionist.", phase: 2 },
  { key: "register_pipeline", type: "auto", title: "Wire it all together", blurb: "We connect the pieces behind the scenes.", phase: 2 },
  { key: "test_agent", type: "user", title: "Give it a test call", blurb: "Call your new receptionist and make sure it sounds right.", phase: 2 },
  { key: "forwarding", type: "user", title: "Forward your calls", blurb: "Send unanswered calls to your receptionist — we'll verify it works.", phase: 2 },
  { key: "a2p", type: "user", title: "Turn on texting", blurb: "Register your business so it can text customers (runs in the background).", phase: 2 },
  { key: "go_live", type: "auto", title: "Go live", blurb: "Your receptionist starts answering calls.", phase: 2 },
];

export const STEP_ORDER: Record<string, number> = Object.fromEntries(
  PIPELINE.map((s, i) => [s.key, i]),
);

export function stepDef(key: string): StepDef | undefined {
  return PIPELINE.find((s) => s.key === key);
}
