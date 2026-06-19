import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "pi-pet",
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    execArgv: ["--max-old-space-size=4096"],
    coverage: {
      exclude: ["types.ts", "index.ts", "git.ts"],
    },
  },
});
