// Shared database wiring for the stress scripts.
//
// These scripts write real rows and delete them again. Pointed at production
// that is data loss, so the guard below is the most important code in this
// directory: production is refused by name, and anything that isn't obviously
// a local file or a staging database has to be opted into explicitly.

import path from "node:path";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

/** Load .env without clobbering anything already exported — so a caller can
 *  override DATABASE_URL to aim at staging. */
export function loadEnv() {
  let raw = "";
  try {
    raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

/** The production database, refused by name. If the Turso database is ever
 *  renamed, update this — a stale value here silently removes the guard. */
const PROD_DB = "switchboard-db28319496";

export function assertSafeDatabase(url) {
  if (!url) throw new Error("DATABASE_URL is not set");

  if (url.includes(PROD_DB)) {
    throw new Error(
      `refusing to run against production (${PROD_DB}).\n` +
        `  These scripts create and delete rows. Point DATABASE_URL at a staging\n` +
        `  database or a local file instead.`,
    );
  }

  const isLocalFile = url.startsWith("file:");
  const isStaging = /staging/i.test(url);
  if (!isLocalFile && !isStaging && process.env.STRESS_ALLOW_REMOTE !== "1") {
    throw new Error(
      `refusing to run against an unrecognised remote database.\n` +
        `  Expected a file: url or one containing "staging". Set STRESS_ALLOW_REMOTE=1\n` +
        `  to override, and be sure about it first.`,
    );
  }
  return { isLocalFile, isStaging };
}

/** Prisma client for whatever database the environment points at, after the
 *  guard has approved it. Local file urls are resolved against prisma/ the same
 *  way lib/db.ts does, so scripts open the file the CLI writes. */
export function stressPrisma() {
  loadEnv();
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  assertSafeDatabase(raw);

  let url = raw;
  if (raw.startsWith("file:")) {
    const rel = raw.slice("file:".length);
    url = path.isAbsolute(rel) ? `file:${rel}` : `file:${path.join(process.cwd(), "prisma", rel)}`;
  }
  return {
    prisma: new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: process.env.TURSO_AUTH_TOKEN }) }),
    target: raw.startsWith("file:") ? "local sqlite" : raw.replace(/\/\/([^.]*).*/, "//$1…"),
  };
}
