import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
      exclude: ["node_modules/", "index.ts", "types.ts"],
    },
  },
});
