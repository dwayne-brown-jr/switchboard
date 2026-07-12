import { prisma } from "@/lib/db";
import { verifyPayload } from "@/lib/secure";

// One-click unsubscribe from the weekly digest (CAN-SPAM). Token is an HMAC of
// the shop id — unforgeable, no login required. Sets Shop.digestOptOut.
function page(title: string, body: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
     <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:12vh auto;padding:32px;text-align:center;color:#0f172a">
       <div style="width:44px;height:44px;border-radius:12px;background:#2449d6;color:#fff;display:grid;place-items:center;font-weight:700;margin:0 auto 16px">S</div>
       <h1 style="font-size:20px;margin:0 0 8px">${title}</h1>
       <p style="color:#475569;line-height:1.5">${body}</p>
     </div>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shopId = url.searchParams.get("shop");
  const token = url.searchParams.get("token");
  if (!shopId || !verifyPayload(`unsub:${shopId}`, token)) {
    return page("Link not valid", "This unsubscribe link is invalid or expired. You can manage email preferences from your dashboard.");
  }
  try {
    await prisma.shop.update({ where: { id: shopId }, data: { digestOptOut: true } });
  } catch {
    return page("Something went wrong", "We couldn't update your preferences. Please try again from your dashboard.");
  }
  return page("You're unsubscribed", "You won't receive the weekly summary email anymore. Your receptionist keeps working exactly as before — this only affects that one email. Want it back? Just reply to any Switchboard email and we'll re-enable it.");
}
