import { describe, it, expect } from "vitest";
import { GoalState } from "./goal-state";
import type { SessionEntry } from "./types";

describe("GoalState", () => {
  it("starts idle with no goal", () => {
    const state = new GoalState();
    expect(state.get()).toBeNull();
    expect(state.getStatus()).toBe("idle");
    expect(state.isActive()).toBe(false);
    expect(state.canAutoContinue()).toBe(false);
  });

  it("sets a goal", () => {
    const state = new GoalState();
    const goal = state.set("Refactor auth");
    expect(goal.objective).toBe("Refactor auth");
    expect(goal.status).toBe("active");
    expect(goal.iterationCount).toBe(0);
    expect(goal.lastEvidence).toBe("");
    expect(goal.nextAction).toBe("");
  });

  it("trims objective", () => {
    const state = new GoalState();
    expect(state.set("  Refactor  ").objective).toBe("Refactor");
  });

  it("rejects empty objective", () => {
    const state = new GoalState();
    expect(() => state.set("")).toThrow("Objective is required");
    expect(() => state.set("   ")).toThrow("Objective is required");
  });

  it("overwrites an existing goal on set", () => {
    const state = new GoalState();
    state.set("Old");
    const goal = state.set("New");
    expect(goal.objective).toBe("New");
    expect(goal.status).toBe("active");
  });

  it("pauses and resumes", () => {
    const state = new GoalState();
    state.set("X");
    state.pause();
    expect(state.getStatus()).toBe("paused");
    state.resume();
    expect(state.getStatus()).toBe("active");
  });

  it("resume is a no-op when idle", () => {
    const state = new GoalState();
    state.resume();
    expect(state.getStatus()).toBe("idle");
  });

  it("pause is a no-op when idle", () => {
    const state = new GoalState();
    state.pause();
    expect(state.getStatus()).toBe("idle");
  });

  it("rejects resume when completed", () => {
    const state = new GoalState();
    state.set("X");
    state.markComplete("Done");
    expect(() => state.resume()).toThrow("Cannot resume");
  });

  it("rejects resume when blocked", () => {
    const state = new GoalState();
    state.set("X");
    state.markBlocked("Missing token");
    expect(() => state.resume()).toThrow("Cannot resume");
  });

  it("clears goal", () => {
    const state = new GoalState();
    state.set("X");
    state.clear();
    expect(state.get()).toBeNull();
    expect(state.canAutoContinue()).toBe(false);
  });

  it("evaluates evidence and next action", () => {
    const state = new GoalState();
    state.set("X");
    const goal = state.evaluate("Tests pass", "Deploy");
    expect(goal.lastEvidence).toBe("Tests pass");
    expect(goal.nextAction).toBe("Deploy");
  });

  it("evaluate can update status", () => {
    const state = new GoalState();
    state.set("X");
    state.evaluate("Stuck", "", "blocked");
    expect(state.getStatus()).toBe("blocked");
  });

  it("evaluate rejects invalid status values", () => {
    const state = new GoalState();
    state.set("X");
    expect(() => state.evaluate("", "", "completed" as any)).toThrow("Invalid evaluate status");
    expect(() => state.evaluate("", "", "idle" as any)).toThrow("Invalid evaluate status");
  });

  it("rejects evaluate when idle", () => {
    const state = new GoalState();
    expect(() => state.evaluate("E")).toThrow("No active goal");
  });

  it("marks complete with evidence", () => {
    const state = new GoalState();
    state.set("X");
    const goal = state.markComplete("CI green");
    expect(goal.status).toBe("completed");
    expect(goal.lastEvidence).toBe("CI green");
    expect(goal.nextAction).toBe("");
  });

  it("rejects complete without evidence", () => {
    const state = new GoalState();
    state.set("X");
    expect(() => state.markComplete("")).toThrow("Evidence is required");
  });

  it("rejects complete when idle", () => {
    const state = new GoalState();
    expect(() => state.markComplete("E")).toThrow("No active goal");
  });

  it("marks blocked with reason", () => {
    const state = new GoalState();
    state.set("X");
    const goal = state.markBlocked("API down", true);
    expect(goal.status).toBe("blocked");
    expect(goal.blocker).toBe("API down");
    expect(goal.nextAction).toBe("Waiting for user input");
  });

  it("marks blocked without next input", () => {
    const state = new GoalState();
    state.set("X");
    const goal = state.markBlocked("API down", false);
    expect(goal.nextAction).toBe("");
  });

  it("rejects blocked without reason", () => {
    const state = new GoalState();
    state.set("X");
    expect(() => state.markBlocked("")).toThrow("Reason is required");
  });

  it("records iterations", () => {
    const state = new GoalState();
    state.set("X");
    state.recordIteration();
    expect(state.get()?.iterationCount).toBe(1);
  });

  it("iteration is a no-op when idle", () => {
    const state = new GoalState();
    state.recordIteration();
    expect(state.get()).toBeNull();
  });

  it("tracks useful work for auto-continue", () => {
    const state = new GoalState();
    state.set("X");
    expect(state.canAutoContinue()).toBe(true);
    state.setHadUsefulWork(false);
    expect(state.canAutoContinue()).toBe(false);
  });

  it("returns deep copies", () => {
    const state = new GoalState();
    state.set("X");
    const g1 = state.get()!;
    g1.objective = "Mutated";
    expect(state.get()?.objective).toBe("X");
  });

  it("snapshot returns deep copy", () => {
    const state = new GoalState();
    state.set("X");
    const snap = state.snapshot()!;
    snap.objective = "Mutated";
    expect(state.get()?.objective).toBe("X");
  });

  describe("fromSession", () => {
    it("restores from valid goal tool result", () => {
      const entries: SessionEntry[] = [
        {
          type: "message",
          message: {
            role: "toolResult",
            toolName: "goal",
            details: {
              goal: {
                objective: "Refactor",
                status: "active",
                iterationCount: 2,
                lastEvidence: "Tests pass",
                nextAction: "Deploy",
              },
            },
          },
        },
      ];
      const state = GoalState.fromSession(entries);
      expect(state.get()?.objective).toBe("Refactor");
      expect(state.get()?.iterationCount).toBe(2);
    });

    it("returns empty state from empty session", () => {
      const state = GoalState.fromSession([]);
      expect(state.get()).toBeNull();
    });

    it("skips wrong toolName", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "todo", details: { goal: {} } } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("skips invalid goal shape", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "goal", details: { goal: { objective: 1 } } } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("uses last valid goal", () => {
      const entries: SessionEntry[] = [
        {
          type: "message",
          message: {
            role: "toolResult",
            toolName: "goal",
            details: { goal: { objective: "Old", status: "active", iterationCount: 0, lastEvidence: "", nextAction: "" } },
          },
        },
        {
          type: "message",
          message: {
            role: "toolResult",
            toolName: "goal",
            details: { goal: { objective: "New", status: "paused", iterationCount: 1, lastEvidence: "", nextAction: "" } },
          },
        },
      ];
      const state = GoalState.fromSession(entries);
      expect(state.get()?.objective).toBe("New");
      expect(state.getStatus()).toBe("paused");
    });
  });
});
