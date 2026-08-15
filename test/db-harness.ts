import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Shared harness for DB-backed tests.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS — read before writing another DB test
// ---------------------------------------------------------------------------
// These tests build a throwaway SQLite database, point DATABASE_URL at it, and
// then wipe tables between cases with unscoped `deleteMany({})`. That is only
// safe while the Prisma client is genuinely connected to the throwaway file.
//
// It is disturbingly easy to break that. `lib/db.ts` resolves DATABASE_URL and
// opens a connection AT MODULE LOAD. So a single ordinary-looking static import
// at the top of a test file:
//
//     import { relativeMonths } from "./caller-context";   // ← pulls in lib/db
//
// loads lib/db BEFORE beforeAll can redirect DATABASE_URL. The client then
// points at the developer's real prisma/dev.db, and the first `beforeEach`
// deletes every call, booking and customer in it. This happened on 2026-08-15
// and cost a local database; the tests still "passed" the run before.
//
// So: this harness sets the URL, imports the client, and then PROVES via
// pragma_database_list that the connection really is the temp file — before any
// test is allowed to delete anything. A static import that binds the wrong
// database now fails loudly in setup instead of quietly destroying data.
//
// Rule for test files using this: import app modules ONLY via the dynamic
// `await import(...)` inside your beforeAll, after calling setupTestDb().

export interface TestDb {
  /** Absolute path of the throwaway database file. */
  file: string;
  prisma: typeof import("../lib/db").prisma;
}

/**
 * Build a fresh database from the live schema, point the app at it, and verify
 * the connection landed where we think it did.
 */
export async function setupTestDb(label: string): Promise<TestDb> {
  const dir = mkdtempSync(path.join(os.tmpdir(), `switchboard-${label}-`));
  const file = path.join(dir, "test.db");

  // Generate DDL from prisma/schema.prisma itself rather than a checked-in
  // snapshot, so these tests can never silently drift from the real model.
  const ddl = execFileSync(
    "npx",
    ["prisma", "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
    { encoding: "utf8", cwd: process.cwd() },
  );

  const { createClient } = await import("@libsql/client");
  const client = createClient({ url: `file:${file}` });
  await client.executeMultiple(ddl);
  client.close();

  process.env.DATABASE_URL = `file:${file}`;

  const { prisma } = await import("../lib/db");
  await assertConnectedTo(prisma, file);

  return { file, prisma };
}

/**
 * The safety interlock. Asks SQLite which file this connection actually has
 * open and refuses to continue unless it's our temp database.
 *
 * Checking `process.env.DATABASE_URL` would NOT be good enough — the whole
 * failure mode is that the env var is correct while the already-constructed
 * client is attached to something else.
 */
async function assertConnectedTo(prisma: TestDb["prisma"], expected: string): Promise<void> {
  const rows = (await prisma.$queryRawUnsafe("SELECT file FROM pragma_database_list WHERE name = 'main'")) as { file: string }[];
  const actual = rows[0]?.file ?? "";

  // Compare real paths, not the strings. On macOS os.tmpdir() hands back
  // /var/folders/... while SQLite reports the resolved /private/var/folders/...
  // — the same file by two names. Comparing raw strings would fail every run
  // and train people to delete the guard.
  const real = (p: string) => {
    try {
      return realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };

  if (!actual || real(actual) !== real(expected)) {
    throw new Error(
      [
        "REFUSING TO RUN: this test's Prisma client is not connected to its temp database.",
        `  expected: ${expected}`,
        `  actual:   ${actual || "(none)"}`,
        "",
        "Almost certainly a STATIC import of an app module at the top of the test file,",
        "which loads lib/db.ts before beforeAll can redirect DATABASE_URL. Move every app",
        "import into `await import(...)` inside beforeAll, after setupTestDb().",
        "",
        "This guard exists because the unscoped deleteMany() calls in these tests would",
        "otherwise wipe the database it IS connected to — e.g. your local prisma/dev.db.",
      ].join("\n"),
    );
  }
}
