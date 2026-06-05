// reviewers/errors.test.ts
import { describe, it, expect } from "vitest";
import { reviewErrors } from "./errors";
import type { ChangedFile } from "../types";

describe("reviewErrors", () => {
  it("finds empty catch blocks", () => {
    const files: ChangedFile[] = [
      {
        path: "src/api.ts",
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
              "+try {",
              "+  await fetch('/api');",
              "+} catch (e) {",
              "+  // ignore",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewErrors(files);
    const finding = result.findings.find((f) => f.type === "empty-catch");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("critical");
  });

  it("finds bare throws", () => {
    const files: ChangedFile[] = [
      {
        path: "src/utils.ts",
        status: "modified",
        additions: 3,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 3,
            lines: ["+if (!valid) {", "+  throw 'invalid';", "+}"],
          },
        ],
      },
    ];

    const result = reviewErrors(files);
    const finding = result.findings.find((f) => f.type === "bare-throw");
    expect(finding).toBeDefined();
  });

  it("counts try/catch occurrences", () => {
    const files: ChangedFile[] = [
      {
        path: "src/api.ts",
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
              "+try {",
              "+  await fetch('/api');",
              "+} catch (e) {",
              "+  console.error(e);",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewErrors(files);
    expect(result.summary.tryCatchCount).toBe(1);
    expect(result.summary.emptyCatchCount).toBe(0);
  });
});
