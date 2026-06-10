import { describe, it, expect, vi } from "vitest";
import { renderOverlay } from "./overlay";
import type { Task } from "./types";

const mockTheme = {
  fg: vi.fn((color: string, text: string) => `[${color}]${text}[/${color}]`),
  bold: vi.fn((text: string) => `**${text}**`),
};

describe("renderOverlay", () => {
  it("returns empty array for no tasks", () => {
    expect(renderOverlay([])).toEqual([]);
  });

  it("returns empty array for only deleted tasks", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "deleted" }];
    expect(renderOverlay(tasks)).toEqual([]);
  });

  it("renders pending task", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "pending" }];
    expect(renderOverlay(tasks)).toEqual(["Tasks (1)", "○ #1 A"]);
  });

  it("renders in_progress task", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "in_progress" }];
    expect(renderOverlay(tasks)).toEqual(["Tasks (1)", "● #1 A"]);
  });

  it("renders completed task", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "completed" }];
    expect(renderOverlay(tasks)).toEqual(["Tasks (1)", "✓ #1 A"]);
  });

  it("sorts by priority: in_progress > pending > completed", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "pending" },
      { id: 2, subject: "B", status: "in_progress" },
      { id: 3, subject: "C", status: "completed" },
    ];
    expect(renderOverlay(tasks)).toEqual([
      "Tasks (3)",
      "● #2 B",
      "○ #1 A",
      "✓ #3 C",
    ]);
  });

  it("filters deleted tasks from visible list", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "pending" },
      { id: 2, subject: "B", status: "deleted" },
      { id: 3, subject: "C", status: "completed" },
    ];
    expect(renderOverlay(tasks)).toEqual([
      "Tasks (2)",
      "○ #1 A",
      "✓ #3 C",
    ]);
  });

  it("does not render description in overlay", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", description: "Desc", status: "pending" }];
    expect(renderOverlay(tasks)).toEqual(["Tasks (1)", "○ #1 A"]);
  });

  it("shows correct count after some deleted", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "deleted" },
      { id: 2, subject: "B", status: "deleted" },
      { id: 3, subject: "C", status: "pending" },
    ];
    expect(renderOverlay(tasks)).toEqual(["Tasks (1)", "○ #3 C"]);
  });

  it("caps at 5 tasks and shows overflow", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "pending" },
      { id: 2, subject: "B", status: "pending" },
      { id: 3, subject: "C", status: "pending" },
      { id: 4, subject: "D", status: "pending" },
      { id: 5, subject: "E", status: "pending" },
      { id: 6, subject: "F", status: "pending" },
    ];
    expect(renderOverlay(tasks)).toEqual([
      "Tasks (6)",
      "○ #1 A",
      "○ #2 B",
      "○ #3 C",
      "○ #4 D",
      "○ #5 E",
      "  +1 more",
    ]);
  });

  it("shows exact overflow count for many tasks", () => {
    const tasks: Task[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      subject: `Task ${i + 1}`,
      status: "pending" as const,
    }));
    const result = renderOverlay(tasks);
    expect(result[0]).toBe("Tasks (10)");
    expect(result).toHaveLength(7); // title + 5 tasks + overflow
    expect(result[result.length - 1]).toBe("  +5 more");
  });

  it("does not show overflow when exactly 5 tasks", () => {
    const tasks: Task[] = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      subject: `Task ${i + 1}`,
      status: "pending" as const,
    }));
    const result = renderOverlay(tasks);
    expect(result).toHaveLength(6); // title + 5 tasks, no overflow line
    expect(result[result.length - 1]).not.toContain("more");
  });

  describe("with theme", () => {
    it("styles title with accent and bold", () => {
      const tasks: Task[] = [{ id: 1, subject: "A", status: "pending" }];
      renderOverlay(tasks, mockTheme);
      expect(mockTheme.bold).toHaveBeenCalledWith("Tasks (1)");
      expect(mockTheme.fg).toHaveBeenCalledWith("accent", expect.stringContaining("Tasks (1)"));
    });

    it("styles pending task in dim", () => {
      const tasks: Task[] = [{ id: 1, subject: "A", status: "pending" }];
      renderOverlay(tasks, mockTheme);
      expect(mockTheme.fg).toHaveBeenCalledWith("dim", "○ #1 A");
    });

    it("styles in_progress task in accent", () => {
      const tasks: Task[] = [{ id: 1, subject: "A", status: "in_progress" }];
      renderOverlay(tasks, mockTheme);
      expect(mockTheme.fg).toHaveBeenCalledWith("accent", "● #1 A");
    });

    it("styles completed task in muted", () => {
      const tasks: Task[] = [{ id: 1, subject: "A", status: "completed" }];
      renderOverlay(tasks, mockTheme);
      expect(mockTheme.fg).toHaveBeenCalledWith("muted", "✓ #1 A");
    });

    it("styles overflow in dim", () => {
      const tasks: Task[] = Array.from({ length: 6 }, (_, i) => ({
        id: i + 1,
        subject: `Task ${i + 1}`,
        status: "pending" as const,
      }));
      renderOverlay(tasks, mockTheme);
      expect(mockTheme.fg).toHaveBeenCalledWith("dim", "  +1 more");
    });
  });
});
