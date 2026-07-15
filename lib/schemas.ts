import { z } from "zod";
import { VERTICALS } from "./verticals";

// ---------------------------------------------------------------------------
// Wizard data — what the owner fills in. Persisted on the AgentVersion draft's
// config while in progress and used to assemble the final config.
// ---------------------------------------------------------------------------
export const serviceSchema = z.object({
  service: z.string(),
  priceRange: z.string().optional().default(""),
  bookable: z.boolean().default(true),
  // How long this service takes, in minutes. Optional — falls back to the shop's
  // default_duration_min when unset (a full detail = 180, a quick wash = 45).
  durationMin: z.number().int().positive().optional(),
});

export const faqSchema = z.object({
  q: z.string(),
  a: z.string().default(""),
});

export const dayHoursSchema = z.object({
  open: z.string().default(""),
  close: z.string().default(""),
  closed: z.boolean().default(false),
});

export const hoursSchema = z.object({
  mon: dayHoursSchema,
  tue: dayHoursSchema,
  wed: dayHoursSchema,
  thu: dayHoursSchema,
  fri: dayHoursSchema,
  sat: dayHoursSchema,
  sun: dayHoursSchema,
});

export const wizardSchema = z.object({
  businessName: z.string().default(""),
  vertical: z.enum(VERTICALS as [string, ...string[]]).default("auto"),
  city: z.string().default(""),
  timezone: z.string().default(""),
  websiteUrl: z.string().default(""),
  businessNumber: z.string().default(""),
  ownerMobile: z.string().default(""),
  serviceArea: z.string().default(""),
  services: z.array(serviceSchema).default([]),
  hours: hoursSchema,
  // Scheduling capacity: how many appointments can run at once (1 mobile washer
  // vs 3 auto-shop bays), the default job length, and a gap/travel buffer around
  // each job. Defaults reproduce the original one-at-a-time / 60-min behavior.
  capacity: z.number().int().min(1).default(1),
  defaultDurationMin: z.number().int().positive().default(60),
  bufferMin: z.number().int().min(0).default(0),
  faqs: z.array(faqSchema).default([]),
  emergencies: z
    .object({
      rules: z.array(z.string()).default([]),
      alertNumber: z.string().default(""),
    })
    .default({ rules: [], alertNumber: "" }),
  voice: z.string().default("11labs-Marissa"),
  greeting: z.string().default(""),
  // wizard progress
  step: z.number().int().default(0),
});

export type WizardData = z.infer<typeof wizardSchema>;

// ---------------------------------------------------------------------------
// Generated config — the canonical, structured business config (no secrets).
// This is what generateConfig() must return; `missing` lists required fields
// that are still unknown, which blocks the pipeline until the owner fills them.
// ---------------------------------------------------------------------------
export const configSchema = z.object({
  client_id: z.string(),
  business_name: z.string().nullable(),
  vertical: z.enum(VERTICALS as [string, ...string[]]),
  city: z.string().nullable(),
  service_area: z.string().nullable(),
  hours: hoursSchema,
  services: z.array(serviceSchema),
  // Scheduling model (see wizardSchema). Optional in config for backward-compat
  // with versions stored before this field existed; callers default them.
  capacity: z.number().int().min(1).default(1),
  default_duration_min: z.number().int().positive().default(60),
  buffer_min: z.number().int().min(0).default(0),
  price_ranges: z.record(z.string(), z.string()),
  booking_fields: z.array(z.string()),
  faqs: z.array(faqSchema),
  hot_job_rules: z.array(z.string()),
  escalation: z.object({
    alert_number: z.string().nullable(),
  }),
  avg_ticket: z.number(),
  service_value_map: z.record(z.string(), z.number()),
  calendar_id: z.string().nullable(),
  owner_phone: z.string().nullable(),
  business_number: z.string().nullable(),
  agent_number: z.string().nullable(),
  voice: z.string(),
  greeting: z.string().nullable(),
  missing: z.array(z.string()),
});

export type ShopConfig = z.infer<typeof configSchema>;

// ---------------------------------------------------------------------------
// Website prefill — LLM extraction from scraped site text.
// ---------------------------------------------------------------------------
export const prefillSchema = z.object({
  services: z.array(serviceSchema).default([]),
  faqs: z.array(faqSchema).default([]),
  hours: hoursSchema.partial().optional(),
  city: z.string().optional().default(""),
  serviceArea: z.string().optional().default(""),
});

export type PrefillResult = z.infer<typeof prefillSchema>;

// ---------------------------------------------------------------------------
// QA verdict.
// ---------------------------------------------------------------------------
export const qaFlagSchema = z.object({
  risk: z.string(),
  fix: z.string(),
});

export const qaResultSchema = z.object({
  verdict: z.enum(["go", "no_go"]),
  flags: z.array(qaFlagSchema),
});

export type QaResult = z.infer<typeof qaResultSchema>;
export type QaFlag = z.infer<typeof qaFlagSchema>;

// ---------------------------------------------------------------------------
// Call ingest — payload n8n posts to /api/ingest/call for each processed call.
// ---------------------------------------------------------------------------
export const callIngestSchema = z.object({
  client_id: z.string(),
  call_id: z.string(),
  timestamp: z.string(), // ISO
  after_hours: z.boolean().optional().default(false),
  duration_sec: z.number().int().nonnegative().optional().default(0),
  caller_phone: z.string().optional().nullable(),
  intent: z.string().optional().nullable(),
  outcome: z.enum(["booked", "message", "escalated", "missed_recovered", "no_action"]).optional().nullable(),
  booked: z.boolean().optional().default(false),
  service: z.string().optional().nullable(),
  appt_time: z.string().optional().nullable(),
  est_job_value: z.number().int().nonnegative().optional().default(0),
  hot_job: z.boolean().optional().default(false),
  recovered: z.boolean().optional().default(false),
  transcript_url: z.string().optional().nullable(),
  flags: z.any().optional(),
});

export type CallIngest = z.infer<typeof callIngestSchema>;
