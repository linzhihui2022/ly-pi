import { describe, it, expect } from "vitest";
import { TaskState } from "./state";
import type { SessionEntry } from "./types";

describe("TaskState", () => {
  it("creates empty state", () => {
    const state = new TaskState();
    expect(state.list()).toEqual([]);
    expect(state.getNextId()).toBe(1);
  });

  it("creates a task", () => {
    const state = new TaskState();
    const task = state.create("Test");
    expect(task.id).toBe(1);
    expect(task.subject).toBe("Test");
    expect(task.status).toBe("pending");
    expect(state.getNextId()).toBe(2);
  });

  it("creates task with description", () => {
    const state = new TaskState();
    const task = state.create("Test", "Desc");
    expect(task.description).toBe("Desc");
  });

  it("trims subject on create", () => {
    const state = new TaskState();
    const task = state.create("  Test  ");
    expect(task.subject).toBe("Test");
  });

  it("rejects empty subject on create", () => {
    const state = new TaskState();
    expect(() => state.create("")).toThrow("Subject is required");
    expect(() => state.create("   ")).toThrow("Subject is required");
  });

  it("gets a task", () => {
    const state = new TaskState();
    state.create("A");
    expect(state.get(1)?.subject).toBe("A");
    expect(state.get(999)).toBeUndefined();
  });

  it("updates subject", () => {
    const state = new TaskState();
    state.create("A");
    const updated = state.update(1, { subject: "B" });
    expect(updated.subject).toBe("B");
  });

  it("trims subject on update", () => {
    const state = new TaskState();
    state.create("A");
    const updated = state.update(1, { subject: "  B  " });
    expect(updated.subject).toBe("B");
  });

  it("rejects empty subject on update", () => {
    const state = new TaskState();
    state.create("A");
    expect(() => state.update(1, { subject: "" })).toThrow("Subject cannot be empty");
    expect(() => state.update(1, { subject: "   " })).toThrow("Subject cannot be empty");
  });

  it("updates description", () => {
    const state = new TaskState();
    state.create("A");
    const updated = state.update(1, { description: "Desc" });
    expect(updated.description).toBe("Desc");
  });

  it("clears description when set to undefined", () => {
    const state = new TaskState();
    state.create("A", "Desc");
    const updated = state.update(1, { description: undefined });
    expect(updated.description).toBeUndefined();
  });

  it("transitions pending → in_progress", () => {
    const state = new TaskState();
    state.create("A");
    const updated = state.update(1, { status: "in_progress" });
    expect(updated.status).toBe("in_progress");
  });

  it("transitions in_progress → pending", () => {
    const state = new TaskState();
    state.create("A");
    state.update(1, { status: "in_progress" });
    const updated = state.update(1, { status: "pending" });
    expect(updated.status).toBe("pending");
  });

  it("transitions to completed", () => {
    const state = new TaskState();
    state.create("A");
    const updated = state.update(1, { status: "completed" });
    expect(updated.status).toBe("completed");
  });

  it("transitions any to deleted", () => {
    const state = new TaskState();
    state.create("A");
    state.update(1, { status: "completed" });
    const updated = state.update(1, { status: "deleted" });
    expect(updated.status).toBe("deleted");
  });

  it("rejects completed → in_progress", () => {
    const state = new TaskState();
    state.create("A");
    state.update(1, { status: "completed" });
    expect(() => state.update(1, { status: "in_progress" })).toThrow("Invalid status transition");
  });

  it("rejects completed → pending", () => {
    const state = new TaskState();
    state.create("A");
    state.update(1, { status: "completed" });
    expect(() => state.update(1, { status: "pending" })).toThrow("Invalid status transition");
  });

  it("rejects deleted → any", () => {
    const state = new TaskState();
    state.create("A");
    state.update(1, { status: "deleted" });
    expect(() => state.update(1, { status: "pending" })).toThrow("Invalid status transition");
  });

  it("rejects update on nonexistent id", () => {
    const state = new TaskState();
    expect(() => state.update(999, { subject: "X" })).toThrow("Task 999 not found");
  });

  it("deletes a task", () => {
    const state = new TaskState();
    state.create("A");
    const deleted = state.delete(1);
    expect(deleted.status).toBe("deleted");
    expect(state.list()).toEqual([]);
  });

  it("lists filters deleted by default", () => {
    const state = new TaskState();
    state.create("A");
    state.create("B");
    state.delete(1);
    expect(state.list().length).toBe(1);
    expect(state.list()[0].subject).toBe("B");
  });

  it("lists includeDeleted shows all", () => {
    const state = new TaskState();
    state.create("A");
    state.delete(1);
    expect(state.list(true).length).toBe(1);
  });

  it("clears all tasks", () => {
    const state = new TaskState();
    state.create("A");
    state.create("B");
    state.clear();
    expect(state.list()).toEqual([]);
    expect(state.getNextId()).toBe(1);
  });

  it("snapshot returns deep copy", () => {
    const state = new TaskState();
    state.create("A");
    const snap = state.snapshot();
    snap.tasks[0].subject = "Mutated";
    expect(state.get(1)?.subject).toBe("A");
  });

  it("getTasks returns deep copy", () => {
    const state = new TaskState();
    state.create("A");
    const tasks = state.getTasks();
    tasks[0].subject = "Mutated";
    expect(state.get(1)?.subject).toBe("A");
  });

  describe("fromSession", () => {
    it("restores from valid session entries", () => {
      const entries: SessionEntry[] = [
        {
          type: "message",
          message: {
            role: "toolResult",
            toolName: "todo",
            details: {
              tasks: [{ id: 1, subject: "A", status: "pending" }],
              nextId: 2,
            },
          },
        },
      ];
      const state = TaskState.fromSession(entries);
      expect(state.list().length).toBe(1);
      expect(state.getNextId()).toBe(2);
    });

    it("restores from empty session", () => {
      const state = TaskState.fromSession([]);
      expect(state.list()).toEqual([]);
    });

    it("skips entries with wrong toolName", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "other", details: {} } },
      ];
      const state = TaskState.fromSession(entries);
      expect(state.list()).toEqual([]);
    });

    it("skips entries with invalid details shape", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "todo", details: { tasks: "bad", nextId: 1 } } },
      ];
      const state = TaskState.fromSession(entries);
      expect(state.list()).toEqual([]);
    });

    it("skips entries with missing details", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "todo" } },
      ];
      const state = TaskState.fromSession(entries);
      expect(state.list()).toEqual([]);
    });

    it("finds last valid entry when multiple exist", () => {
      const entries: SessionEntry[] = [
        {
          type: "message",
          message: {
            role: "toolResult",
            toolName: "todo",
            details: {
              tasks: [{ id: 1, subject: "Old", status: "completed" }],
              nextId: 2,
            },
          },
        },
        {
          type: "message",
          message: {
            role: "toolResult",
            toolName: "todo",
            details: {
              tasks: [{ id: 1, subject: "New", status: "pending" }],
              nextId: 2,
            },
          },
        },
      ];
      const state = TaskState.fromSession(entries);
      expect(state.get(1)?.subject).toBe("New");
    });

    it("skips entries with non-message type", () => {
      const entries: SessionEntry[] = [
        { type: "other", message: { role: "toolResult", toolName: "todo", details: { tasks: [], nextId: 1 } } },
      ];
      const state = TaskState.fromSession(entries);
      expect(state.list()).toEqual([]);
    });

    it("skips entries with null details", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "todo", details: null as unknown as Record<string, unknown> } },
      ];
      const state = TaskState.fromSession(entries);
      expect(state.list()).toEqual([]);
    });

    it("skips entries with non-object details", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "todo", details: "bad" as unknown as Record<string, unknown> } },
      ];
      const state = TaskState.fromSession(entries);
      expect(state.list()).toEqual([]);
    });

    it("skips entries with array tasks but invalid nextId", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "todo", details: { tasks: [], nextId: "bad" } as unknown as Record<string, unknown> } },
      ];
      const state = TaskState.fromSession(entries);
      expect(state.list()).toEqual([]);
    });

    it("skips entries with missing message", () => {
      const entries: SessionEntry[] = [
        { type: "message" },
      ];
      const state = TaskState.fromSession(entries);
      expect(state.list()).toEqual([]);
    });
  });
});
