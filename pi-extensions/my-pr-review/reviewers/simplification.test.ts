// reviewers/simplification.test.ts
import { describe, it, expect } from "vitest";
import { reviewSimplification } from "./simplification";
import type { ChangedFile } from "../types";

describe("reviewSimplification", () => {
  it("flags long functions", () => {
    const lines = Array.from({ length: 60 }, (_, i) => `+  line${i}();`);
    lines.unshift("+export function longFunc() {");
    lines.push("+}");

    const files: ChangedFile[] = [
      {
        path: "src/big.ts",
        status: "modified",
        additions: 62,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 62,
            lines,
          },
        ],
      },
    ];

    const result = reviewSimplification(files);
    const finding = result.findings.find((f) => f.type === "long-function");
    expect(finding).toBeDefined();
  });

  it("flags deep nesting", () => {
    const files: ChangedFile[] = [
      {
        path: "src/nested.ts",
        status: "modified",
        additions: 10,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 10,
            lines: [
              "+if (a) {",
              "+  if (b) {",
              "+    if (c) {",
              "+      if (d) {",
              "+        if (e) {",
              "+          doSomething();",
              "+        }",
              "+      }",
              "+    }",
              "+  }",
            ],
          },
        ],
      },
    ];

    const result = reviewSimplification(files);
    const finding = result.findings.find((f) => f.type === "deep-nesting");
    expect(finding).toBeDefined();
  });

  it("flags duplicated code blocks", () => {
    const files: ChangedFile[] = [
      {
        path: "src/dup.ts",
        status: "modified",
        additions: 8,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 8,
            lines: [
              "+const x = a + b;",
              "+const y = x * 2;",
              "+return y;",
              "+}",
              "+const x = a + b;",
              "+const y = x * 2;",
              "+return y;",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewSimplification(files);
    const finding = result.findings.find((f) => f.type === "duplicate-code");
    expect(finding).toBeDefined();
  });
});
