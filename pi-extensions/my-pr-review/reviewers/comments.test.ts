// reviewers/comments.test.ts
import { describe, it, expect } from "vitest";
import { reviewComments } from "./comments";
import type { ChangedFile } from "../types";

describe("reviewComments", () => {
  it("finds inaccurate comments", () => {
    const files: ChangedFile[] = [
      {
        path: "src/auth.ts",
        status: "modified",
        additions: 5,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 5,
            lines: [
              "+// Returns string",
              "+export function getUser(): string {",
              "+  return 42;",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewComments(files);
    const finding = result.findings.find(
      (f) => f.type === "inaccurate-comment"
    );
    expect(finding).toBeDefined();
    expect(finding?.file).toBe("src/auth.ts");
    expect(finding?.severity).toBe("warning");
  });

  it("flags missing comments on exported functions", () => {
    const files: ChangedFile[] = [
      {
        path: "src/utils.ts",
        status: "added",
        additions: 3,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 3,
            lines: [
              "+export function complexCalc(a: number, b: number) {",
              "+  return a * b + Math.sqrt(a);",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewComments(files);
    const finding = result.findings.find((f) => f.type === "missing-comment");
    expect(finding).toBeDefined();
  });

  it("returns empty for no issues", () => {
    const files: ChangedFile[] = [];
    const result = reviewComments(files);
    expect(result.findings).toEqual([]);
  });
});
