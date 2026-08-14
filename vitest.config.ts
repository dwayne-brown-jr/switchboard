import path from "node:path";
import { defineConfig } from "vitest/config";

// Keep vitest out of build output and agent worktrees (.claude/worktrees holds
// throwaway checkouts whose stale test copies otherwise pollute the run).
//
// __checks__ is excluded too: those .spec.ts files are Playwright tests executed
// by Checkly's cloud runtime, not unit tests. Vitest can load them but Playwright
// refuses to run test() outside its own runner, so they'd fail the suite.
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", ".claude/**", ".next/**", "mobile/**", "__checks__/**"],
  },
  resolve: {
    alias: {
      // `server-only` is a build-time marker Next resolves; it doesn't exist as
      // a real package, so any lib guarding itself with it was unimportable
      // from a test. See test/server-only-stub.ts.
      "server-only": path.resolve(__dirname, "test/server-only-stub.ts"),
      // Mirror the tsconfig "@/*" path alias so libs can be imported the same
      // way tests and app code already reference them.
      "@": path.resolve(__dirname),
    },
  },
});
