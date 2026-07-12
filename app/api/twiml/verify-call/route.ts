// TwiML for the forwarding-verification outbound call. The owner is told not to
// answer; if their no-answer forwarding is set, the call rolls to the agent.
export async function POST() {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">This is a Switchboard verification call. You can ignore it. We're just checking your call forwarding is set up. Goodbye.</Say>
  <Pause length="20"/>
</Response>`;
  return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
}

export const GET = POST;
