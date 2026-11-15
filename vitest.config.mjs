import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    // Threads instead of the default forks pool: the test suite needs no
    // process isolation, and threads also run where process spawning is
    // restricted (sandboxes, some CI runners).
    pool: "threads",
  },
});
