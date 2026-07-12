// Per-vertical definitions. Single source of truth for: wizard seed data
// (starter services / FAQs / emergency rules), the booking fields the calendar
// needs, and the baked-in safety rules that owners can never remove.
//
// Extension point (do NOT build in v1): additional verticals would be added
// here plus a matching template in lib/templates/.

export type Vertical = "auto" | "auto_appearance" | "hvac" | "home_services" | "cleaning" | "other";

export const VERTICALS: Vertical[] = ["auto", "auto_appearance", "hvac", "home_services", "cleaning", "other"];

export type SeedService = { service: string; priceRange?: string; bookable: boolean };
export type SeedFaq = { q: string; a: string };

export interface VerticalDef {
  id: Vertical;
  label: string;
  tagline: string;
  /** Booking fields the calendar/agent must collect for this trade. Baked in. */
  bookingFields: string[];
  /** Hot-job (emergency) conditions that trigger owner escalation. Baked defaults. */
  hotJobRules: string[];
  services: SeedService[];
  faqs: SeedFaq[];
  /** Typical average ticket, used for revenue estimates until the owner edits. */
  avgTicket: number;
  /** Rough per-service value map for revenue estimates (service -> dollars). */
  serviceValueMap: Record<string, number>;
}

export const VERTICAL_DEFS: Record<Vertical, VerticalDef> = {
  auto: {
    id: "auto",
    label: "Auto repair",
    tagline: "Mechanical repair, tires, oil & diagnostics.",
    bookingFields: ["customer_name", "phone", "vehicle_year", "vehicle_make", "vehicle_model", "service_needed", "preferred_time"],
    hotJobRules: [
      "Vehicle won't start / dead in a driveway",
      "Driver stranded on the roadside",
      "Vehicle needs a tow",
      "Fleet vehicle down (business customer)",
    ],
    services: [
      { service: "Oil change", priceRange: "$45–$90", bookable: true },
      { service: "Brake service", priceRange: "", bookable: true },
      { service: "Check-engine / diagnostics", priceRange: "", bookable: true },
      { service: "A/C service", priceRange: "", bookable: true },
      { service: "Tire rotation", priceRange: "$25–$50", bookable: true },
      { service: "State inspection", priceRange: "", bookable: true },
    ],
    faqs: [
      { q: "Do you take walk-ins?", a: "" },
      { q: "Is there a diagnostic / service fee?", a: "" },
      { q: "Do you offer a warranty on repairs?", a: "" },
      { q: "Do you offer financing?", a: "" },
      { q: "What's your service area?", a: "" },
    ],
    avgTicket: 420,
    serviceValueMap: {
      "Oil change": 70,
      "Brake service": 450,
      "Check-engine / diagnostics": 130,
      "A/C service": 350,
      "Tire rotation": 40,
      "State inspection": 40,
    },
  },
  auto_appearance: {
    id: "auto_appearance",
    label: "Auto detailing & customization",
    tagline: "Detailing, ceramic, wraps, tint & PPF.",
    bookingFields: ["customer_name", "phone", "vehicle_year", "vehicle_make", "vehicle_model", "vehicle_size", "service_needed", "preferred_time"],
    hotJobRules: [
      "Full wrap or paint-protection-film job (high value)",
      "Fleet or dealer job (multiple vehicles)",
      "Needs it done before a sale, show, or event (deadline)",
    ],
    services: [
      { service: "Full detail (interior + exterior)", priceRange: "$150–$400", bookable: true },
      { service: "Interior deep clean", priceRange: "$100–$250", bookable: true },
      { service: "Ceramic coating", priceRange: "", bookable: true },
      { service: "Window tint", priceRange: "$150–$450", bookable: true },
      { service: "Vehicle wrap", priceRange: "", bookable: true },
      { service: "Paint protection film (PPF)", priceRange: "", bookable: true },
      { service: "Headlight restoration", priceRange: "$60–$120", bookable: true },
    ],
    faqs: [
      { q: "How long does the service take?", a: "" },
      { q: "Do I drop off or wait?", a: "" },
      { q: "Does pricing depend on vehicle size or condition?", a: "" },
      { q: "Do you offer mobile service?", a: "" },
      { q: "What's your service area?", a: "" },
    ],
    avgTicket: 300,
    serviceValueMap: {
      "Full detail (interior + exterior)": 275,
      "Interior deep clean": 175,
      "Ceramic coating": 900,
      "Window tint": 300,
      "Vehicle wrap": 3000,
      "Paint protection film (PPF)": 1800,
      "Headlight restoration": 90,
    },
  },
  hvac: {
    id: "hvac",
    label: "Heating & Air",
    tagline: "HVAC repair, install, and maintenance.",
    bookingFields: ["customer_name", "phone", "service_address", "system_type", "issue", "preferred_time"],
    hotJobRules: [
      "No heat during extreme cold",
      "No cooling during extreme heat",
      "Gas smell (safety)",
      "Water leak from the system",
      "Vulnerable occupant (elderly, infant, medical)",
    ],
    services: [
      { service: "Repair / service call", priceRange: "", bookable: true },
      { service: "Seasonal maintenance / tune-up", priceRange: "$89–$150", bookable: true },
      { service: "New system estimate", priceRange: "", bookable: true },
      { service: "Thermostat install", priceRange: "", bookable: true },
      { service: "Indoor air quality consult", priceRange: "", bookable: true },
    ],
    faqs: [
      { q: "Is there a service / diagnostic fee?", a: "" },
      { q: "Do you offer free estimates on new systems?", a: "" },
      { q: "Do you offer financing?", a: "" },
      { q: "What brands do you service?", a: "" },
      { q: "What's your service area?", a: "" },
    ],
    avgTicket: 480,
    serviceValueMap: {
      "Repair / service call": 350,
      "Seasonal maintenance / tune-up": 120,
      "New system estimate": 6500,
      "Thermostat install": 250,
      "Indoor air quality consult": 400,
    },
  },
  home_services: {
    id: "home_services",
    label: "Home services",
    tagline: "Plumbing, electrical, and general home repair.",
    bookingFields: ["customer_name", "phone", "service_address", "trade", "issue", "preferred_time"],
    hotJobRules: [
      "Active water leak / flooding",
      "Sewage backup",
      "Total loss of power",
      "Sparking / burning smell (electrical)",
      "Gas smell (safety)",
    ],
    services: [
      { service: "Diagnostic / estimate visit", priceRange: "", bookable: true },
      { service: "Scheduled repair job", priceRange: "", bookable: true },
      { service: "Drain cleaning", priceRange: "", bookable: true },
      { service: "Water heater service", priceRange: "", bookable: true },
      { service: "Electrical repair", priceRange: "", bookable: true },
    ],
    faqs: [
      { q: "Is there a trip / diagnostic fee?", a: "" },
      { q: "Are you licensed and insured?", a: "" },
      { q: "Do you give free estimates?", a: "" },
      { q: "What trades do you cover?", a: "" },
      { q: "What's your service area?", a: "" },
    ],
    avgTicket: 380,
    serviceValueMap: {
      "Diagnostic / estimate visit": 90,
      "Scheduled repair job": 550,
      "Drain cleaning": 250,
      "Water heater service": 1200,
      "Electrical repair": 400,
    },
  },
  cleaning: {
    id: "cleaning",
    label: "Cleaning & maid service",
    tagline: "House cleaning, maid service & janitorial.",
    bookingFields: ["customer_name", "phone", "service_address", "home_size", "cleaning_type", "preferred_time"],
    hotJobRules: [
      "Move-in / move-out with a hard deadline",
      "Same-day or next-day request",
      "Recurring or commercial client (high value)",
      "Post-construction or post-event cleanup",
    ],
    services: [
      { service: "Standard cleaning", priceRange: "", bookable: true },
      { service: "Deep cleaning", priceRange: "", bookable: true },
      { service: "Move-in / move-out cleaning", priceRange: "", bookable: true },
      { service: "Recurring cleaning (weekly/biweekly)", priceRange: "", bookable: true },
      { service: "Post-construction cleaning", priceRange: "", bookable: true },
    ],
    faqs: [
      { q: "How is pricing determined (size / frequency)?", a: "" },
      { q: "Do you bring your own supplies?", a: "" },
      { q: "Are you insured and bonded?", a: "" },
      { q: "Do I need to be home during the cleaning?", a: "" },
      { q: "What's your service area?", a: "" },
    ],
    avgTicket: 180,
    serviceValueMap: {
      "Standard cleaning": 140,
      "Deep cleaning": 260,
      "Move-in / move-out cleaning": 300,
      "Recurring cleaning (weekly/biweekly)": 130,
      "Post-construction cleaning": 400,
    },
  },
  other: {
    id: "other",
    label: "Other local service",
    tagline: "Any appointment-based local business.",
    bookingFields: ["customer_name", "phone", "service_location", "service_needed", "preferred_time"],
    hotJobRules: [
      "Caller says it's urgent or an emergency",
      "Large, commercial, or recurring job (high value)",
    ],
    services: [
      { service: "Service call / appointment", priceRange: "", bookable: true },
      { service: "Estimate / quote visit", priceRange: "", bookable: true },
      { service: "Recurring service", priceRange: "", bookable: true },
    ],
    faqs: [
      { q: "How much does it cost?", a: "" },
      { q: "Do you offer free estimates?", a: "" },
      { q: "Are you licensed and insured?", a: "" },
      { q: "How soon can you come out?", a: "" },
      { q: "What's your service area?", a: "" },
    ],
    avgTicket: 250,
    serviceValueMap: {
      "Service call / appointment": 250,
      "Estimate / quote visit": 120,
      "Recurring service": 150,
    },
  },
};

export function isVertical(v: string): v is Vertical {
  return (VERTICALS as string[]).includes(v);
}

export function verticalDef(v: string): VerticalDef {
  return VERTICAL_DEFS[isVertical(v) ? v : "auto"];
}

export const DEFAULT_HOURS = {
  mon: { open: "08:00", close: "17:00", closed: false },
  tue: { open: "08:00", close: "17:00", closed: false },
  wed: { open: "08:00", close: "17:00", closed: false },
  thu: { open: "08:00", close: "17:00", closed: false },
  fri: { open: "08:00", close: "17:00", closed: false },
  sat: { open: "09:00", close: "13:00", closed: false },
  sun: { open: "", close: "", closed: true },
};

export const DAY_LABELS: Record<keyof typeof DEFAULT_HOURS, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

// Real, previewable voices. `id` IS the provider voice id used at provisioning
// (no mapping/guessing) so what the owner hears is exactly what callers get.
// `preview` is the provider's sample-audio URL, played in the wizard.
export const VOICES = [
  { id: "11labs-Marissa", name: "Marissa", desc: "Warm and welcoming — friendly front desk.", preview: "https://retell-utils-public.s3.us-west-2.amazonaws.com/marissa.mp3" },
  { id: "openai-Nova", name: "Nova", desc: "Calm and clear — reassuring and professional.", preview: "https://retell-utils-public.s3.us-west-2.amazonaws.com/nova_.wav" },
  { id: "cartesia-Emily", name: "Emily", desc: "Bright and helpful — quick and cheerful.", preview: "https://retell-utils-public.s3.us-west-2.amazonaws.com/cartesia-9b63a859-58b7-4388-a5ff-eeb3cbb701ed.mp3" },
  { id: "11labs-Billy", name: "Billy", desc: "Easygoing and confident — puts callers at ease.", preview: "https://retell-utils-public.s3.us-west-2.amazonaws.com/billy.mp3" },
  { id: "retell-Nico", name: "Nico", desc: "Steady and grounded — no-nonsense but kind.", preview: "https://retell-utils-public.s3.us-west-2.amazonaws.com/minimax_nico.mp3" },
  { id: "cartesia-Andrew", name: "Andrew", desc: "Polished and professional — a classic receptionist.", preview: "https://retell-utils-public.s3.us-west-2.amazonaws.com/cartesia-57b18927-80da-4929-a185-517ccc549976.mp3" },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

export const DEFAULT_VOICE: VoiceId = "11labs-Marissa";
