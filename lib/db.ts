import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

// Turso/libSQL adapter. Works with a local `file:` url in dev and a remote
// `libsql://` Turso url + auth token in prod — all under the platform's single
// master account (no per-shop database).
//
// Local `file:` urls are resolved relative to the `prisma/` directory so the
// runtime opens the SAME file the Prisma CLI writes (the CLI anchors relative
// sqlite paths at the schema's directory). Remote urls pass through untouched.
function resolveUrl(raw: string | undefined): string {
  const url = raw ?? "file:./dev.db";
  if (!url.startsWith("file:")) return url;
  const rel = url.slice("file:".length);
  if (path.isAbsolute(rel)) return `file:${rel}`;
  return `file:${path.join(process.cwd(), "prisma", rel)}`;
}

const url = resolveUrl(process.env.DATABASE_URL);
const authToken = process.env.TURSO_AUTH_TOKEN;

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createClient() {
  const adapter = new PrismaLibSQL({ url, authToken });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
