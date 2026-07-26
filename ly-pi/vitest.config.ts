import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    execArgv: ["--max-old-space-size=4096"],
    coverage: {
      exclude: ["**/types.ts", "**/index.ts", "scripts/**"],
      thresholds: {
        branches: 96,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
