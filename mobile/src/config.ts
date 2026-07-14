// The Switchboard API the app talks to. Defaults to production; point it at your
// machine (e.g. http://192.168.x.x:3000) when developing against `npm run dev`.
// Use a LAN IP, not localhost — localhost on a phone/simulator is the device
// itself, not your computer.
export const API_BASE_URL = "https://getswitchboardhq.com";

// iOS-inspired palette. Neutrals follow Apple's system grays; brand blue is kept
// for continuity with the web app.
export const COLORS = {
  brand: "#2449d6",
  brandTint: "#EAEEFB",
  bg: "#F2F2F7", // systemGroupedBackground
  card: "#FFFFFF",
  text: "#1C1C1E", // label
  secondary: "#6C6C70", // secondaryLabel
  muted: "#8E8E93", // tertiaryLabel / systemGray
  faint: "#C7C7CC", // systemGray3
  border: "#E5E5EA", // separator
  green: "#34C759",
  greenBg: "#E4F8EA",
  red: "#FF3B30",
  redBg: "#FFECEA",
  amber: "#FF9500",
  amberBg: "#FFF2E0",
};
