import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderGoalOverlay } from "./goal-overlay";
import type { Goal } from "./types";

const mockTheme = {
  fg: vi.fn((color: string, text: string) => `[${color}]${text}[/${color}]`),
  bold: vi.fn((text: string) => `**${text}**`),
};

beforeEach(() => {
  vi.clearAllMocks();
});

function makeGoal(partial: Partial<Goal> = {}): Goal {
  return {
    objective: "Refactor auth",
    status: "active",
    iterationCount: 0,
    lastEvidence: "",
    nextAction: "",
    ...partial,
  };
}

describe("renderGoalOverlay", () => {
  it("renders active goal without evidence", () => {
    const result = renderGoalOverlay(makeGoal());
    expect(result).toEqual(["Goal [active]", "Refactor auth"]);
  });

  it("renders iterations when > 0", () => {
    const result = renderGoalOverlay(makeGoal({ iterationCount: 3 }));
    expect(result).toContain("Iterations: 3");
  });

  it("renders evidence summary", () => {
    const result = renderGoalOverlay(makeGoal({ lastEvidence: "Tests pass" }));
    expect(result).toContain("Evidence: Tests pass");
  });

  it("truncates long objective", () => {
    const long = "a".repeat(50);
    const result = renderGoalOverlay(makeGoal({ objective: long }));
    expect(result[1]).toBe(long.slice(0, 37) + "...");
  });

  it("truncates long evidence", () => {
    const long = "b".repeat(50);
    const result = renderGoalOverlay(makeGoal({ lastEvidence: long }));
    const evidenceLine = result.find((l) => l.startsWith("Evidence:"));
    expect(evidenceLine).toContain("...");
  });

  it("renders paused status", () => {
    const result = renderGoalOverlay(makeGoal({ status: "paused" }));
    expect(result[0]).toBe("Goal [paused]");
  });

  it("renders completed status", () => {
    const result = renderGoalOverlay(makeGoal({ status: "completed" }));
    expect(result[0]).toBe("Goal [completed]");
  });

  it("renders blocked status with blocker", () => {
    const result = renderGoalOverlay(
      makeGoal({ status: "blocked", blocker: "API down" }),
    );
    expect(result[0]).toBe("Goal [blocked]");
    expect(result).toContain("Blocker: API down");
  });

  it("styles title with theme", () => {
    renderGoalOverlay(makeGoal(), mockTheme);
    expect(mockTheme.bold).toHaveBeenCalledWith("Goal [active]");
    expect(mockTheme.fg).toHaveBeenCalledWith(
      "accent",
      expect.stringContaining("Goal [active]"),
    );
  });

  it("styles iterations with theme", () => {
    renderGoalOverlay(makeGoal({ iterationCount: 3 }), mockTheme);
    expect(mockTheme.fg).toHaveBeenCalledWith("dim", "Iterations: 3");
  });

  it("styles evidence with theme", () => {
    renderGoalOverlay(makeGoal({ lastEvidence: "Tests pass" }), mockTheme);
    expect(mockTheme.fg).toHaveBeenCalledWith("dim", "Evidence: Tests pass");
  });

  it("styles blocker with theme", () => {
    renderGoalOverlay(
      makeGoal({ status: "blocked", blocker: "API down" }),
      mockTheme,
    );
    expect(mockTheme.fg).toHaveBeenCalledWith("error", "Blocker: API down");
  });
});
