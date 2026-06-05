// reviewers/quality.test.ts
import { describe, it, expect } from "vitest";
import { reviewQuality } from "./quality";
import type { ChangedFile } from "../types";

describe("reviewQuality", () => {
  it("flags functions with high cyclomatic complexity", () => {
    const files: ChangedFile[] = [
      {
        path: "src/logic.ts",
        status: "modified",
        additions: 20,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 20,
            lines: [
              "+export function decide(a, b, c, d) {",
              "+  if (a) {",
              "+    if (b) return 1;",
              "+    else if (c) return 2;",
              "+    else if (d) return 3;",
              "+  } else if (b) {",
              "+    if (c) return 4;",
              "+    else if (d) return 5;",
              "+    else return 6;",
              "+  } else {",
              "+    return 7;",
              "+  }",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewQuality(files);
    const finding = result.findings.find((f) => f.type === "high-complexity");
    expect(finding).toBeDefined();
  });

  it("flags console.log in production code", () => {
    const files: ChangedFile[] = [
      {
        path: "src/api.ts",
        status: "modified",
        additions: 3,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 3,
            lines: [
              "+export function fetch() {",
              "+  console.log('fetching');",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewQuality(files);
    const finding = result.findings.find((f) => f.type === "debug-log");
    expect(finding).toBeDefined();
  });

  it("returns empty for clean code", () => {
    const files: ChangedFile[] = [
      {
        path: "src/clean.ts",
        status: "modified",
        additions: 3,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 3,
            lines: [
              "+export function add(a: number, b: number): number {",
              "+  return a + b;",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewQuality(files);
    expect(result.findings).toEqual([]);
  });
});
