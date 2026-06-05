// reviewers/types.test.ts
import { describe, it, expect } from "vitest";
import { reviewTypes } from "./types";
import type { ChangedFile } from "../types";

describe("reviewTypes", () => {
  it("finds any usage", () => {
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
              "+export function process(data: any): any {",
              "+  return data;",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewTypes(files);
    const finding = result.findings.find((f) => f.type === "implicit-any");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("warning");
  });

  it("flags missing return type on exported function", () => {
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
            lines: [
              "+export function parse(input: string) {",
              "+  return JSON.parse(input);",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewTypes(files);
    const finding = result.findings.find((f) => f.type === "missing-return-type");
    expect(finding).toBeDefined();
  });

  it("returns empty for non-ts files", () => {
    const files: ChangedFile[] = [
      {
        path: "README.md",
        status: "modified",
        additions: 1,
        deletions: 0,
        hunks: [{ oldStart: 1, oldCount: 0, newStart: 1, newCount: 1, lines: ["+# Hello"] }],
      },
    ];

    const result = reviewTypes(files);
    expect(result.findings).toEqual([]);
  });
});
