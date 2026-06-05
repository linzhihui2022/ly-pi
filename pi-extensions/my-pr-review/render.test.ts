// render.test.ts
import { describe, it, expect } from "vitest";
import { severityIcon, formatFinding, formatReviewResult } from "./render";
import type { ReviewFinding, ReviewResult } from "./types";

describe("severityIcon", () => {
  it("returns correct icons", () => {
    expect(severityIcon("info")).toBe("ℹ");
    expect(severityIcon("warning")).toBe("⚠");
    expect(severityIcon("critical")).toBe("✗");
  });
});

describe("formatFinding", () => {
  it("formats finding with line number", () => {
    const finding: ReviewFinding = {
      type: "test",
      file: "src/a.ts",
      line: 42,
      severity: "warning",
      description: "Something is wrong",
    };
    expect(formatFinding(finding)).toBe("⚠ src/a.ts:42 — Something is wrong");
  });

  it("formats finding without line number", () => {
    const finding: ReviewFinding = {
      type: "test",
      file: "src/a.ts",
      severity: "info",
      description: "Note",
    };
    expect(formatFinding(finding)).toBe("ℹ src/a.ts — Note");
  });
});

describe("formatReviewResult", () => {
  it("formats result with findings", () => {
    const result: ReviewResult = {
      findings: [
        { type: "a", file: "f.ts", severity: "warning", description: "d1" },
        { type: "b", file: "f.ts", severity: "info", description: "d2" },
      ],
      summary: { count: 2 },
    };
    const formatted = formatReviewResult(result, "Test");
    expect(formatted).toContain("Test");
    expect(formatted).toContain("⚠ f.ts — d1");
    expect(formatted).toContain("ℹ f.ts — d2");
  });
});
