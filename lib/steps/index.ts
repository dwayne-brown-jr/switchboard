import type { AutoHandler } from "./types";
import { generateConfigHandler, generatePromptHandler, qaReviewHandler } from "./generate";
import {
  provisionVoiceHandler,
  provisionCalendarHandler,
  provisionNumberHandler,
  registerPipelineHandler,
} from "./provision";
import { goLiveHandler } from "./golive";

// Registry of AUTO step handlers by pipeline key. User steps (account, wizard,
// subscribe, test_agent, forwarding, a2p) are not here — they pause the run and
// are completed from the owner's checklist UI.
export const AUTO_HANDLERS: Record<string, AutoHandler> = {
  // Phase 1 — the brain.
  generate_config: generateConfigHandler,
  generate_prompt: generatePromptHandler,
  qa_review: qaReviewHandler,
  // Phase 2 — provisioning + go-live.
  provision_voice: provisionVoiceHandler,
  provision_calendar: provisionCalendarHandler,
  provision_number: provisionNumberHandler,
  register_pipeline: registerPipelineHandler,
  go_live: goLiveHandler,
};
