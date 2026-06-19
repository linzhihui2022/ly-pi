import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderActiveOverlay,
  renderCompletedOverlay,
  renderPlanOverlay,
} from "./overlay";
import type { Task } from "./types";

const mockTheme = {
  fg: vi.fn((color: string, text: string) => `[${color}]${text}[/${color}]`),
  bold: vi.fn((text: string) => `**${text}**`),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("renderActiveOverlay", () => {
  it("returns empty array when no tasks", () => {
    expect(renderActiveOverlay([])).toEqual([]);
  });

  it("returns empty array for only completed tasks", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "completed" }];
    expect(renderActiveOverlay(tasks)).toEqual([]);
  });

  it("returns empty array for only deleted tasks", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "deleted" }];
    expect(renderActiveOverlay(tasks)).toEqual([]);
  });

  it("renders pending task", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "pending" }];
    expect(renderActiveOverlay(tasks)).toEqual(["Active (1)", "○ #1 A"]);
  });

  it("renders in_progress task", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "in_progress" }];
    expect(renderActiveOverlay(tasks)).toEqual(["Active (1)", "● #1 A"]);
  });

  it("sorts in_progress before pending", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "pending" },
      { id: 2, subject: "B", status: "in_progress" },
    ];
    expect(renderActiveOverlay(tasks)).toEqual([
      "Active (2)",
      "● #2 B",
      "○ #1 A",
    ]);
  });

  it("caps at 3 tasks and shows overflow", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "pending" },
      { id: 2, subject: "B", status: "pending" },
      { id: 3, subject: "C", status: "pending" },
      { id: 4, subject: "D", status: "pending" },
    ];
    expect(renderActiveOverlay(tasks)).toEqual([
      "Active (4)",
      "○ #1 A",
      "○ #2 B",
      "○ #3 C",
      "  +1 more",
    ]);
  });

  it("shows exact overflow count for many tasks", () => {
    const tasks: Task[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      subject: `Task ${i + 1}`,
      status: "pending" as const,
    }));
    const result = renderActiveOverlay(tasks);
    expect(result[0]).toBe("Active (10)");
    expect(result).toHaveLength(5); // title + 3 tasks + overflow
    expect(result[result.length - 1]).toBe("  +7 more");
  });

  it("does not render description in overlay", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", description: "details", status: "pending" },
    ];
    expect(renderActiveOverlay(tasks)).toEqual(["Active (1)", "○ #1 A"]);
  });

  it("does not show overflow when exactly 3 tasks", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "pending" },
      { id: 2, subject: "B", status: "pending" },
      { id: 3, subject: "C", status: "pending" },
    ];
    const result = renderActiveOverlay(tasks);
    expect(result).toHaveLength(4);
    expect(result[result.length - 1]).not.toContain("more");
  });

  it("shows correct count after some deleted", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "deleted" },
      { id: 2, subject: "B", status: "deleted" },
      { id: 3, subject: "C", status: "pending" },
    ];
    expect(renderActiveOverlay(tasks)).toEqual(["Active (1)", "○ #3 C"]);
  });
});

describe("renderCompletedOverlay", () => {
  it("returns empty array when no tasks", () => {
    expect(renderCompletedOverlay([])).toEqual([]);
  });

  it("returns empty array for active tasks", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "pending" },
      { id: 2, subject: "B", status: "in_progress" },
    ];
    expect(renderCompletedOverlay(tasks)).toEqual([]);
  });

  it("returns empty array for deleted tasks", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "deleted" }];
    expect(renderCompletedOverlay(tasks)).toEqual([]);
  });

  it("renders completed task", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "completed" }];
    expect(renderCompletedOverlay(tasks)).toEqual(["Completed (1)", "✓ #1 A"]);
  });

  it("sorts by id descending", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "completed" },
      { id: 3, subject: "C", status: "completed" },
      { id: 2, subject: "B", status: "completed" },
    ];
    expect(renderCompletedOverlay(tasks)).toEqual([
      "Completed (3)",
      "✓ #3 C",
      "✓ #2 B",
      "✓ #1 A",
    ]);
  });

  it("caps at 3 tasks and shows overflow", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "completed" },
      { id: 2, subject: "B", status: "completed" },
      { id: 3, subject: "C", status: "completed" },
      { id: 4, subject: "D", status: "completed" },
    ];
    expect(renderCompletedOverlay(tasks)).toEqual([
      "Completed (4)",
      "✓ #4 D",
      "✓ #3 C",
      "✓ #2 B",
      "  +1 more",
    ]);
  });
});

describe("renderActiveOverlay with theme", () => {
  it("styles title with accent and bold", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "pending" }];
    renderActiveOverlay(tasks, mockTheme);
    expect(mockTheme.bold).toHaveBeenCalledWith("Active (1)");
    expect(mockTheme.fg).toHaveBeenCalledWith(
      "accent",
      expect.stringContaining("Active (1)"),
    );
  });

  it("styles pending task in dim", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "pending" }];
    renderActiveOverlay(tasks, mockTheme);
    expect(mockTheme.fg).toHaveBeenCalledWith("dim", "○ #1 A");
  });

  it("styles in_progress task in accent", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "in_progress" }];
    renderActiveOverlay(tasks, mockTheme);
    expect(mockTheme.fg).toHaveBeenCalledWith("accent", "● #1 A");
  });

  it("styles overflow in dim", () => {
    const tasks: Task[] = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      subject: `Task ${i + 1}`,
      status: "pending" as const,
    }));
    renderActiveOverlay(tasks, mockTheme);
    expect(mockTheme.fg).toHaveBeenCalledWith("dim", "  +1 more");
  });
});

describe("renderCompletedOverlay with theme", () => {
  it("styles title with muted and bold", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "completed" }];
    renderCompletedOverlay(tasks, mockTheme);
    expect(mockTheme.bold).toHaveBeenCalledWith("Completed (1)");
    expect(mockTheme.fg).toHaveBeenCalledWith(
      "muted",
      expect.stringContaining("Completed (1)"),
    );
  });

  it("styles completed task in muted", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "completed" }];
    renderCompletedOverlay(tasks, mockTheme);
    expect(mockTheme.fg).toHaveBeenCalledWith("muted", "✓ #1 A");
  });

  it("styles overflow in dim", () => {
    const tasks: Task[] = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      subject: `Task ${i + 1}`,
      status: "completed" as const,
    }));
    renderCompletedOverlay(tasks, mockTheme);
    expect(mockTheme.fg).toHaveBeenCalledWith("dim", "  +1 more");
  });
});

describe("renderPlanOverlay", () => {
  it("returns empty array for no tasks", () => {
    expect(renderPlanOverlay([], "planning")).toEqual([]);
  });

  it("returns empty array for only deleted tasks", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "deleted" }];
    expect(renderPlanOverlay(tasks, "planning")).toEqual([]);
  });

  it("renders title 'Plan (N)' for planning phase", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "pending" },
      { id: 2, subject: "B", status: "pending" },
    ];
    const result = renderPlanOverlay(tasks, "planning");
    expect(result[0]).toBe("Plan (2)");
    expect(result).toEqual(["Plan (2)", "○ #1 A", "○ #2 B"]);
  });

  it("renders title 'Executing (N)' for executing phase", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "in_progress" }];
    const result = renderPlanOverlay(tasks, "executing");
    expect(result[0]).toBe("Executing (1)");
    expect(result).toEqual(["Executing (1)", "● #1 A"]);
  });

  it("sorts in_progress before pending", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "pending" },
      { id: 2, subject: "B", status: "in_progress" },
    ];
    const result = renderPlanOverlay(tasks, "executing");
    expect(result).toEqual(["Executing (2)", "● #2 B", "○ #1 A"]);
  });

  it("caps at 3 tasks with overflow", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "pending" },
      { id: 2, subject: "B", status: "pending" },
      { id: 3, subject: "C", status: "pending" },
      { id: 4, subject: "D", status: "pending" },
    ];
    const result = renderPlanOverlay(tasks, "planning");
    expect(result).toEqual([
      "Plan (4)",
      "○ #1 A",
      "○ #2 B",
      "○ #3 C",
      "  +1 more",
    ]);
  });

  it("filters completed and deleted tasks", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "pending" },
      { id: 2, subject: "B", status: "completed" },
      { id: 3, subject: "C", status: "deleted" },
    ];
    const result = renderPlanOverlay(tasks, "planning");
    expect(result).toEqual(["Plan (1)", "○ #1 A"]);
  });
});

describe("renderPlanOverlay with theme", () => {
  it("styles title with accent and bold", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "pending" }];
    renderPlanOverlay(tasks, "planning", mockTheme);
    expect(mockTheme.bold).toHaveBeenCalledWith("Plan (1)");
    expect(mockTheme.fg).toHaveBeenCalledWith(
      "accent",
      expect.stringContaining("Plan (1)"),
    );
  });
});
