# Switchboard — Owner app (Expo)

The native owner app (iOS + Android). It talks to the same backend as the web
dashboard over the `/api/mobile/*` endpoints — it shares **no code** with the web
app, only the HTTP API, so nothing here can break the deployed website.

## What it does (Phase 1)

- **Sign in** with email + a 6-digit code (no passwords).
- **Home** — live/paused status, a one-tap pause switch, and a 30-day summary
  (calls answered, jobs booked, revenue, saved-from-voicemail).
- **Calls** — the recent-calls feed.
- **Push notifications** — a push on every new booking and flagged emergency.

## Run it

```bash
cd mobile
npm install
# If Expo warns about versions: npx expo install --fix
npx expo start          # then press i (iOS sim) / a (Android) or scan the QR in Expo Go
```

### Point it at your backend

`src/config.ts` → `API_BASE_URL`.

- **Production** (default): `https://getswitchboardhq.com`
- **Local dev**: your machine's LAN IP, e.g. `http://192.168.1.20:3000` (run
  `npm run dev` in the repo root). Don't use `localhost` — on a phone/simulator
  that points at the device itself, not your computer.

## Notes / next steps

- **Push in a real build**: `getExpoPushTokenAsync` needs an EAS `projectId`.
  Run `eas init` and set it in `app.json → extra.eas.projectId`. In the Expo Go
  dev client on a physical device it works without one; simulators never issue a
  push token.
- **Prod database**: the server's mobile tables (`DeviceToken`, `MobileAuthCode`)
  must exist in the production Turso DB — run `prisma db push` against prod once
  (the same step used when the Booking table was added).
- **Backlog**: appointments list, call recording playback, and VoIP/CallKit
  (answer a transferred call in-app) — Phases 2–3.
```
