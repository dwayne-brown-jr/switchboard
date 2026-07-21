import { ImageResponse } from "next/og";

// iOS home-screen icon. Generated rather than committed as a PNG so it can never
// drift from components/logo.tsx.
//
// Two deliberate differences from the web icon: no rounded corners (iOS masks
// its own, and baking them in leaves dark corners on the home screen), and a
// slightly larger mark, since this is viewed at thumb size rather than in a
// browser tab.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #3563eb 0%, #1e3aac 100%)",
        }}
      >
        <svg width="118" height="118" viewBox="0 0 48 48">
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
    ),
    { ...size },
  );
}
