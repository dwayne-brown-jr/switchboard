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
});
