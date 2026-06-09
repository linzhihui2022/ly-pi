import { describe, it, expect } from "vitest";
import { renderOverlay } from "./overlay";
import type { Task } from "./types";

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
    expect(renderOverlay(tasks)).toEqual(["Tasks (1)", "⏳ #1 A"]);
  });

  it("renders in_progress task", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "in_progress" }];
    expect(renderOverlay(tasks)).toEqual(["Tasks (1)", "🔄 #1 A"]);
  });

  it("renders completed task", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "completed" }];
    expect(renderOverlay(tasks)).toEqual(["Tasks (1)", "✓ #1 A"]);
  });

  it("renders multiple tasks in order", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "pending" },
      { id: 2, subject: "B", status: "in_progress" },
      { id: 3, subject: "C", status: "completed" },
    ];
    expect(renderOverlay(tasks)).toEqual([
      "Tasks (3)",
      "⏳ #1 A",
      "🔄 #2 B",
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
      "⏳ #1 A",
      "✓ #3 C",
    ]);
  });

  it("does not render description in overlay", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", description: "Desc", status: "pending" }];
    expect(renderOverlay(tasks)).toEqual(["Tasks (1)", "⏳ #1 A"]);
  });

  it("shows correct count after some deleted", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "deleted" },
      { id: 2, subject: "B", status: "deleted" },
      { id: 3, subject: "C", status: "pending" },
    ];
    expect(renderOverlay(tasks)).toEqual(["Tasks (1)", "⏳ #3 C"]);
  });
});
