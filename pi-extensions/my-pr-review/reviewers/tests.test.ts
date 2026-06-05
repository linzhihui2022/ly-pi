// reviewers/tests.test.ts
import { describe, it, expect } from "vitest";
import { reviewTests } from "./tests";
import type { ChangedFile } from "../types";

describe("reviewTests", () => {
  it("finds missing tests for new source files", () => {
    const files: ChangedFile[] = [
      {
        path: "src/auth.ts",
        status: "added",
        additions: 20,
        deletions: 0,
        hunks: [],
      },
    ];

    const result = reviewTests(files);
    const finding = result.findings.find((f) => f.type === "missing-test");
    expect(finding).toBeDefined();
    expect(finding?.file).toBe("src/auth.ts");
    expect(finding?.severity).toBe("warning");
  });

  it("recognizes matching test file", () => {
    const files: ChangedFile[] = [
      {
        path: "src/auth.ts",
        status: "modified",
        additions: 5,
        deletions: 0,
        hunks: [],
      },
      {
        path: "src/auth.test.ts",
        status: "modified",
        additions: 10,
        deletions: 0,
        hunks: [],
      },
    ];

    const result = reviewTests(files);
    const missing = result.findings.find((f) => f.type === "missing-test");
    expect(missing).toBeUndefined();
  });

  it("finds uncovered changes", () => {
    const files: ChangedFile[] = [
      {
        path: "src/utils.ts",
        status: "modified",
        additions: 15,
        deletions: 0,
        hunks: [],
      },
      {
        path: "src/auth.test.ts",
        status: "modified",
        additions: 5,
        deletions: 0,
        hunks: [],
      },
    ];

    const result = reviewTests(files);
    const uncovered = result.findings.find((f) => f.type === "uncovered-change");
    expect(uncovered).toBeDefined();
    expect(uncovered?.file).toBe("src/utils.ts");
  });
});
