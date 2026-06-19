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

  it("evaluate updates only nextAction when evidence omitted", () => {
    const state = new GoalState();
    state.set("X");
    state.evaluate("Initial", "");
    const goal = state.evaluate(undefined, "Deploy");
    expect(goal.lastEvidence).toBe("Initial");
    expect(goal.nextAction).toBe("Deploy");
  });

  it("evaluate can update status", () => {
    const state = new GoalState();
    state.set("X");
    state.evaluate("Stuck", "", "blocked");
    expect(state.getStatus()).toBe("blocked");
  });

  it("evaluate can update only status", () => {
    const state = new GoalState();
    state.set("X");
    state.evaluate("Evidence", "Next");
    const goal = state.evaluate(undefined, undefined, "paused");
    expect(goal.status).toBe("paused");
    expect(goal.lastEvidence).toBe("Evidence");
    expect(goal.nextAction).toBe("Next");
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

  it("evaluate records entry", () => {
    const state = new GoalState();
    state.set("X");
    state.recordIteration();
    state.evaluate("Tests pass", "Deploy");
    const entries = state.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ iteration: 1, evidence: "Tests pass", nextAction: "Deploy", status: "active" });
  });

  it("markComplete records entry", () => {
    const state = new GoalState();
    state.set("X");
    state.recordIteration();
    state.markComplete("CI green");
    const entries = state.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ iteration: 1, evidence: "CI green", nextAction: "", status: "completed" });
  });

  it("markBlocked records entry", () => {
    const state = new GoalState();
    state.set("X");
    state.markBlocked("API down", false);
    const entries = state.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ iteration: 0, evidence: "", nextAction: "", status: "blocked" });
  });

  it("set clears entries", () => {
    const state = new GoalState();
    state.set("X");
    state.evaluate("E", "N");
    expect(state.getEntries()).toHaveLength(1);
    state.set("Y");
    expect(state.getEntries()).toHaveLength(0);
  });

  it("clear clears entries", () => {
    const state = new GoalState();
    state.set("X");
    state.evaluate("E", "N");
    expect(state.getEntries()).toHaveLength(1);
    state.clear();
    expect(state.getEntries()).toHaveLength(0);
  });

  it("snapshot includes entries", () => {
    const state = new GoalState();
    state.set("X");
    state.evaluate("E", "N");
    const snap = state.snapshot()!;
    expect(snap.entries).toHaveLength(1);
  });

  it("entries are deep copied in get", () => {
    const state = new GoalState();
    state.set("X");
    state.evaluate("E", "N");
    const g = state.get()!;
    g.entries![0].evidence = "Mutated";
    expect(state.getEntries()[0].evidence).toBe("E");
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

  it("snapshot returns null when idle", () => {
    const state = new GoalState();
    expect(state.snapshot()).toBeNull();
  });

  it("rejects blocked when idle", () => {
    const state = new GoalState();
    expect(() => state.markBlocked("Reason")).toThrow("No active goal");
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
                entries: [{ iteration: 1, evidence: "Started", nextAction: "Fix", status: "active" }],
              },
            },
          },
        },
      ];
      const state = GoalState.fromSession(entries);
      expect(state.get()?.objective).toBe("Refactor");
      expect(state.get()?.iterationCount).toBe(2);
      expect(state.getEntries()).toHaveLength(1);
      expect(state.getEntries()[0].evidence).toBe("Started");
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

    it("skips non-message entries", () => {
      const entries: SessionEntry[] = [
        { type: "system", message: { role: "toolResult", toolName: "goal", details: { goal: { objective: "X", status: "active", iterationCount: 0, lastEvidence: "", nextAction: "" } } } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("skips entries without toolResult role", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "assistant", toolName: "goal", details: { goal: { objective: "X", status: "active", iterationCount: 0, lastEvidence: "", nextAction: "" } } } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("skips null details", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "goal", details: null } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("skips non-object details", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "goal", details: "bad" } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("skips goal that is not an object", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "goal", details: { goal: 123 } } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("skips goal that is null", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "goal", details: { goal: null } } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("skips goal with non-string objective", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "goal", details: { goal: { objective: 1, status: "active", iterationCount: 0, lastEvidence: "", nextAction: "" } } } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("skips goal with invalid status", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "goal", details: { goal: { objective: "X", status: "unknown", iterationCount: 0, lastEvidence: "", nextAction: "" } } } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("skips goal with non-number iterationCount", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "goal", details: { goal: { objective: "X", status: "active", iterationCount: "0", lastEvidence: "", nextAction: "" } } } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("skips goal with non-string lastEvidence", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "goal", details: { goal: { objective: "X", status: "active", iterationCount: 0, lastEvidence: 1, nextAction: "" } } } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("skips goal with non-string nextAction", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "goal", details: { goal: { objective: "X", status: "active", iterationCount: 0, lastEvidence: "", nextAction: 1 } } } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("skips goal with non-string blocker", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "goal", details: { goal: { objective: "X", status: "blocked", iterationCount: 0, lastEvidence: "", nextAction: "", blocker: 1 } } } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });
  });
});
