// Per-carrier "forward calls you don't answer" instructions. {NUMBER} is
// replaced with the shop's agent number in the UI. Codes are the common US
// conditional-forwarding (no-answer/busy) codes; the owner can always call their
// carrier if their plan differs. Client-safe (no server imports).

export interface Carrier {
  id: string;
  name: string;
  /** Steps to turn ON no-answer forwarding. */
  steps: string[];
  /** How to turn it back off. */
  turnOff?: string;
}

export const CARRIERS: Carrier[] = [
  {
    id: "att",
    name: "AT&T",
    steps: [
      "Open your phone's dialer.",
      "Dial *004*{NUMBER}# and press call.",
      "Wait for the confirmation tone, then hang up.",
    ],
    turnOff: "To turn it off later, dial ##004# and press call.",
  },
  {
    id: "verizon",
    name: "Verizon",
    steps: [
      "Open your phone's dialer.",
      "Dial *71 then {NUMBER} (no spaces) and press call.",
      "Wait for the tone or message, then hang up.",
    ],
    turnOff: "To turn it off later, dial *73 and press call.",
  },
  {
    id: "tmobile",
    name: "T-Mobile",
    steps: [
      "Open your phone's dialer.",
      "Dial **004*{NUMBER}# and press call.",
      "Wait for the confirmation, then hang up.",
    ],
    turnOff: "To turn it off later, dial ##004# and press call.",
  },
  {
    id: "cable_voip",
    name: "Spectrum / cable phone (VoIP)",
    steps: [
      "Sign in to your phone provider's account or app.",
      "Find Call Forwarding settings (sometimes 'Forward on no answer' or 'Nuisance/advanced calling').",
      "Set calls you don't answer to forward to {NUMBER}.",
      "Save. If you can't find it, call your provider and ask them to set 'no-answer forwarding' to that number.",
    ],
  },
  {
    id: "office_other",
    name: "Office phone system / other",
    steps: [
      "In your phone system (PBX/VoIP) admin, find Call Forwarding or Call Handling.",
      "Set 'forward on no answer' (and 'busy' if available) to {NUMBER}.",
      "Save and apply. If unsure, forward this number to your phone provider and ask for no-answer forwarding.",
    ],
  },
];

export function carrier(id: string): Carrier | undefined {
  return CARRIERS.find((c) => c.id === id);
}
