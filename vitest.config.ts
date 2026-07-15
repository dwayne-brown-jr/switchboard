import { defineConfig } from "vitest/config";

// Keep vitest out of build output and agent worktrees (.claude/worktrees holds
// throwaway checkouts whose stale test copies otherwise pollute the run).
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", ".claude/**", ".next/**", "mobile/**"],
  },
});
