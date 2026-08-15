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

// The globalThis cache exists so Next's dev hot-reload doesn't open a fresh
// connection pool on every edit.
//
// Under vitest it does the exact opposite of its job. Each DB-backed test file
// builds its own temp database and points DATABASE_URL at it before importing
// this module — but a client cached on globalThis by an EARLIER test file
// ignores that entirely and keeps writing to the first file's database. The
// symptom is baffling: the second file to run fails seeding with a unique
// constraint violation, because the rows it's creating are already there.
// So under test, always build a client for the URL we were actually given.
const isTest = Boolean(process.env.VITEST);

export const prisma = (!isTest && globalForPrisma.prisma) || createClient();

if (!isTest && process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
