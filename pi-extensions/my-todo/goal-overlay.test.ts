import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderGoalOverlay } from "./goal-overlay";
import type { ActiveGoal } from "./types";

const mockTheme = {
  fg: vi.fn((color: string, text: string) => `[${color}]${text}[/${color}]`),
  bold: vi.fn((text: string) => `**${text}**`),
};

beforeEach(() => {
  vi.clearAllMocks();
});

function makeGoal(partial: Partial<ActiveGoal> = {}): ActiveGoal {
  return {
    id: "goal-1",
    text: "Refactor auth",
    status: "active",
    startedAt: 1,
    updatedAt: 2,
    iteration: 0,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    ...partial,
  };
}

describe("renderGoalOverlay", () => {
  it("renders active goal with objective and iteration", () => {
    const result = renderGoalOverlay(
      makeGoal({ iteration: 2, timeUsedSeconds: 90 }),
    );
    expect(result).toEqual([
      "Goal [active]",
      "Refactor auth",
      "Iterations: 2",
    ]);
  });

  it("renders paused status with blocker", () => {
    const result = renderGoalOverlay(
      makeGoal({ status: "paused", blocker: "API down" }),
    );
    expect(result).toEqual([
      "Goal [paused]",
      "Refactor auth",
      "Iterations: 0",
      "Paused: API down",
    ]);
  });

  it("renders complete status with objective", () => {
    const result = renderGoalOverlay(makeGoal({ status: "complete" }));
    expect(result).toEqual([
      "Goal [complete]",
      "Refactor auth",
      "Iterations: 0",
    ]);
  });

  it("truncates long objective", () => {
    const long = "a".repeat(50);
    const result = renderGoalOverlay(makeGoal({ text: long }));
    expect(result[1]).toBe(long.slice(0, 37) + "...");
  });

  it("truncates long blocker", () => {
    const long = "b".repeat(50);
    const result = renderGoalOverlay(
      makeGoal({ status: "paused", blocker: long }),
    );
    const blockerLine = result.find((l) => l.startsWith("Paused:"));
    expect(blockerLine).toContain("...");
  });

  it("styles title with theme", () => {
    renderGoalOverlay(makeGoal(), mockTheme);
    expect(mockTheme.bold).toHaveBeenCalledWith("Goal [active]");
    expect(mockTheme.fg).toHaveBeenCalledWith(
      "accent",
      expect.stringContaining("Goal [active]"),
    );
  });

  it("styles objective with theme", () => {
    renderGoalOverlay(makeGoal(), mockTheme);
    expect(mockTheme.fg).toHaveBeenCalledWith("dim", "Refactor auth");
  });

  it("styles iterations with theme", () => {
    renderGoalOverlay(makeGoal({ iteration: 3 }), mockTheme);
    expect(mockTheme.fg).toHaveBeenCalledWith("dim", "Iterations: 3");
  });

  it("styles paused blocker with theme", () => {
    renderGoalOverlay(
      makeGoal({ status: "paused", blocker: "API down" }),
      mockTheme,
    );
    expect(mockTheme.fg).toHaveBeenCalledWith("error", "Paused: API down");
  });
});
