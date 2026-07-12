# Switchboard × n8n

`switchboard-core.json` is one importable n8n workflow with **five webhook entry
points** that connect the Switchboard platform to your voice/calendar/SMS stack.
It's a working starting point — attach your credentials and adjust field names to
match your voice provider's exact call payload.

## What's inside

| Webhook path | Who calls it | What it does |
|---|---|---|
| `POST /switchboard/registry` | The Switchboard platform (`register_pipeline` step) | Stores each shop's config (client_id, numbers, Cal.com event-type map, ingest URL + secret) in the workflow's shared static data. |
| `POST /switchboard/check-availability` | The voice agent (tool) | Looks up the shop + service → returns open Cal.com slots. |
| `POST /switchboard/create-booking` | The voice agent (tool) | Books the appointment on the shop's Cal.com. |
| `POST /switchboard/notify-owner` | The voice agent (tool) | Texts the owner (Twilio) about an emergency/message. |
| `POST /switchboard/call-events` | Your voice provider (Retell/Vapi call-ended webhook) | Maps the processed call → posts a `CallRecord` to the platform's `/api/ingest/call`. |

The registry and the tools share **workflow static data**, which is why they're
one workflow (n8n static data is per-workflow).

## Setup

1. **Import** `switchboard-core.json` into n8n (Workflows → Import from File).
2. **Set n8n environment variables** (Settings → Variables, or host env):
   - `N8N_REGISTRY_TOKEN` — must match the platform's `N8N_REGISTRY_TOKEN`.
   - `CALCOM_API_KEY`, `TWILIO_ACCOUNT_SID` — used by the HTTP nodes.
3. **Add credentials** for the **Twilio SMS** node: create an *HTTP Basic Auth*
   credential with your Twilio Account SID (username) + Auth Token (password) and
   select it on that node.
4. **Activate** the workflow, then copy the production webhook base URL (e.g.
   `https://your-n8n.example/webhook`) into the platform env:
   - `N8N_BROKER_URL=https://your-n8n.example/webhook/switchboard`
   - `N8N_REGISTRY_URL=https://your-n8n.example/webhook/switchboard/registry`
   - `N8N_REGISTRY_TOKEN=<the same token as step 2>`
5. **Point your voice provider's call-ended webhook** at
   `https://your-n8n.example/webhook/switchboard/call-events?client_id={shopId}`.
   (The platform already sets the agent's webhook to this URL during provisioning.)

## Notes

- The agent tool URLs the platform configures are
  `${N8N_BROKER_URL}/check-availability?client_id=…`, `.../create-booking`,
  `.../notify-owner` — matching the webhook paths above.
- `notify-owner` only actually texts when the shop's `a2p_status` is `approved`
  (the platform tracks this); otherwise treat it as a queued note.
- The `Map Call → Ingest` code node assumes a Retell-style payload
  (`call_analysis`, `from_number`, `duration_ms`). Adjust the field mapping to
  your provider. The platform validates the final payload with zod, so a bad
  mapping fails loudly at `/api/ingest/call`.
- For production, put n8n behind HTTPS and keep `N8N_REGISTRY_TOKEN` secret — the
  registry holds each shop's ingest secret.
