import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "pi-pet",
    pool: "forks",
    fileParallelism: false,
    passWithNoTests: true,
    maxWorkers: 1,
    execArgv: ["--max-old-space-size=4096"],
    coverage: {
      reporter: [["text", { skipFull: false }], "json", "html"],
      exclude: ["types.ts", "index.ts"],
    },
  },
});
