import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./db";
import { sendEmail, magicLinkEmail } from "./email";
import { isAdminEmail } from "./admin";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

// "Continue with Google" — the primary sign-in for shop owners (most have a
// Gmail/Workspace account) and it needs no email delivery. Only enabled when
// the OAuth creds are configured; magic-link email remains as a fallback.
const socialProviders = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  ? {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
    }
  : undefined;

export const auth = betterAuth({
  baseURL: appUrl,
  secret: process.env.AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  // Passwordless only — non-technical owners, no passwords ever.
  emailAndPassword: { enabled: false },
  socialProviders,
  // Link a Google sign-in to an existing (magic-link) account with the same email.
  account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
  // Throttle auth endpoints (magic-link requests, verification).
  rateLimit: { enabled: true, window: 60, max: 10 },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh daily
  },
  user: {
    additionalFields: {
      // Set on User; also enforced live via ADMIN_EMAILS (see requireAdmin).
      isAdmin: { type: "boolean", defaultValue: false, input: false },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 15, // 15 minutes
      async sendMagicLink({ email, url }) {
        const { subject, html, text } = magicLinkEmail(url);
        await sendEmail({ to: email, subject, html, text });
        // Keep newly-created users flagged as admin if their email is allow-listed.
        if (isAdminEmail(email)) {
          await prisma.user
            .updateMany({ where: { email }, data: { isAdmin: true } })
            .catch(() => {});
        }
      },
    }),
    nextCookies(), // must be last — sets auth cookies on Next server actions
  ],
});

export type Session = typeof auth.$Infer.Session;
