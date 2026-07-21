import { ImageResponse } from "next/og";
import { PLANS } from "@/lib/plans";

// The card shown when a link to the site is pasted into a text, Slack, LinkedIn
// or an email preview. Until now there was none, so every shared link rendered
// as a blank rectangle — and this product is sold largely by owners forwarding
// it to each other.
//
// Written for a thumbnail, not a poster: three short lines, high contrast, no
// small print. It is often seen at a couple of hundred pixels wide.
//
// Generated at build time from the same mark as components/logo.tsx so the two
// cannot drift apart.

export const alt = "Switchboard — an AI receptionist that answers every call";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 92px",
          background: "linear-gradient(135deg, #1f316d 0%, #1e3aac 55%, #2449d6 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <div
            style={{
              width: 96,
              height: 96,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 26,
              background: "rgba(255,255,255,0.12)",
            }}
          >
            <svg width="64" height="64" viewBox="0 0 48 48">
              <path
                d="M18.5 14c-3.2 0-5 1.6-5 3.6 0 7.6 9.3 16.9 16.9 16.9 2 0 3.6-1.8 3.6-5 0-1-.6-1.6-1.6-2l-3.4-1.3c-1-.4-1.8-.1-2.4.7l-1.2 1.6c-2.6-1.3-4.7-3.4-6-6l1.6-1.2c.8-.6 1.1-1.4.7-2.4l-1.3-3.4c-.4-1-1-1.5-1.9-1.5z"
                fill="#fff"
              />
              <path
                d="M31 12.5a10 10 0 0 1 6 6"
                stroke="#f97316"
                strokeWidth="3.2"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div style={{ fontSize: 52, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>
            Switchboard
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 78,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "-0.035em",
            lineHeight: 1.05,
            marginTop: 46,
          }}
        >
          Never miss another call.
        </div>

        {/* One line, deliberately. At 34px the longer version wrapped and left
            "mo." orphaned on its own row, which looks broken at thumbnail size.
            Price comes from lib/plans so it cannot drift from the pricing card. */}
        <div style={{ display: "flex", fontSize: 34, color: "#bcd2ff", marginTop: 26 }}>
          {`Answers every call, books the job — $${PLANS[0].price}/mo.`}
        </div>
      </div>
    ),
    { ...size },
  );
}
