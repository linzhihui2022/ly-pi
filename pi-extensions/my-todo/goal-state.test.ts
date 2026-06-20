import { describe, it, expect } from "vitest";
import { GoalState } from "./goal-state";
import type { SessionEntry } from "./types";

describe("GoalState", () => {
  it("starts idle", () => {
    const state = new GoalState();
    expect(state.get()).toBeNull();
    expect(state.getStatus()).toBe("idle");
    expect(state.isActive()).toBe(false);
    expect(state.canAutoContinue()).toBe(false);
  });

  it("sets a goal", () => {
    const state = new GoalState();
    const goal = state.set("Refactor auth");
    expect(goal.text).toBe("Refactor auth");
    expect(goal.status).toBe("active");
    expect(goal.iteration).toBe(0);
    expect(goal.tokensUsed).toBe(0);
    expect(goal.timeUsedSeconds).toBe(0);
  });

  it("trims objective", () => {
    const state = new GoalState();
    expect(state.set("  Refactor  ").text).toBe("Refactor");
  });

  it("rejects empty objective", () => {
    const state = new GoalState();
    expect(() => state.set("")).toThrow("Objective is required");
  });

  it("rejects objective over 4000 chars", () => {
    const state = new GoalState();
    expect(() => state.set("x".repeat(4001))).toThrow("too long");
  });

  it("pauses and resumes", () => {
    const state = new GoalState();
    state.set("X");
    state.pause();
    expect(state.getStatus()).toBe("paused");
    state.resume();
    expect(state.getStatus()).toBe("active");
  });

  it("rejects resume when complete", () => {
    const state = new GoalState();
    state.set("X");
    state.markComplete("Done");
    expect(() => state.resume()).toThrow("Cannot resume");
  });

  it("clears goal", () => {
    const state = new GoalState();
    state.set("X");
    state.clear();
    expect(state.get()).toBeNull();
  });

  it("edits goal text", () => {
    const state = new GoalState();
    state.set("Old");
    const goal = state.edit("New");
    expect(goal.text).toBe("New");
    expect(goal.status).toBe("active");
  });

  it("evaluates evidence and next action", () => {
    const state = new GoalState();
    state.set("X");
    const goal = state.evaluate("Tests pass", "Deploy");
    expect(goal.tokensUsed).toBe(0);
    expect(goal.iteration).toBe(0);
  });

  it("evaluate can pause", () => {
    const state = new GoalState();
    state.set("X");
    state.evaluate("Stuck", "", "paused");
    expect(state.getStatus()).toBe("paused");
    expect(state.get()?.blocker).toBe("Paused by evaluate");
  });

  it("evaluate active clears blocker", () => {
    const state = new GoalState();
    state.set("X");
    state.evaluate("Stuck", "", "paused");
    state.evaluate("OK", "", "active");
    expect(state.get()?.blocker).toBeUndefined();
  });

  it("resume clears blocker", () => {
    const state = new GoalState();
    state.set("X");
    state.markBlocked("API down");
    state.resume();
    expect(state.get()?.blocker).toBeUndefined();
  });

  it("markBlocked rejects complete goal", () => {
    const state = new GoalState();
    state.set("X");
    state.markComplete("Done");
    expect(() => state.markBlocked("Nope")).toThrow("Cannot block a completed goal");
  });

  it("edit rejects complete goal", () => {
    const state = new GoalState();
    state.set("X");
    state.markComplete("Done");
    expect(() => state.edit("New")).toThrow("Cannot edit a completed goal");
  });

  it("evaluate rejects complete goal", () => {
    const state = new GoalState();
    state.set("X");
    state.markComplete("Done");
    expect(() => state.evaluate("E", "N", "active")).toThrow("Cannot evaluate a completed goal");
  });

  it("mark_blocked pauses with blocker", () => {
    const state = new GoalState();
    state.set("X");
    const goal = state.markBlocked("API down");
    expect(goal.status).toBe("paused");
    expect(goal.blocker).toBe("API down");
  });

  it("mark_complete sets complete", () => {
    const state = new GoalState();
    state.set("X");
    const goal = state.markComplete("CI green");
    expect(goal.status).toBe("complete");
  });

  it("records iteration", () => {
    const state = new GoalState();
    state.set("X");
    state.recordIteration();
    expect(state.get()?.iteration).toBe(1);
  });

  it("updateUsage updates time", () => {
    const state = new GoalState();
    state.set("X");
    state.updateUsage(100, 5000);
    const goal = state.get()!;
    expect(goal.tokensUsed).toBe(100);
    expect(goal.timeUsedSeconds).toBe(5);
  });

  it("restores from custom goal-state entry", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "goal-state",
        data: {
          goal: {
            id: "g1",
            text: "Refactor",
            status: "active",
            startedAt: 1,
            updatedAt: 2,
            iteration: 2,
            tokensUsed: 10,
            timeUsedSeconds: 30,
          },
        },
      },
    ];
    const state = GoalState.fromSession(entries);
    expect(state.get()?.text).toBe("Refactor");
    expect(state.get()?.iteration).toBe(2);
  });

  it("skips complete goal on restore", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "goal-state",
        data: { goal: { id: "g1", text: "X", status: "complete", startedAt: 1, updatedAt: 1, iteration: 0, tokensUsed: 0, timeUsedSeconds: 0 } },
      },
    ];
    expect(GoalState.fromSession(entries).get()).toBeNull();
  });

  it("uses last goal-state entry", () => {
    const entries: SessionEntry[] = [
      { type: "custom", customType: "goal-state", data: { goal: { id: "g1", text: "Old", status: "active", startedAt: 1, updatedAt: 1, iteration: 0, tokensUsed: 0, timeUsedSeconds: 0 } } },
      { type: "custom", customType: "goal-state", data: { goal: { id: "g2", text: "New", status: "paused", startedAt: 1, updatedAt: 1, iteration: 1, tokensUsed: 0, timeUsedSeconds: 0 } } },
    ];
    const state = GoalState.fromSession(entries);
    expect(state.get()?.text).toBe("New");
    expect(state.getStatus()).toBe("paused");
  });

  describe("edge cases", () => {
    it("edit rejects empty text", () => {
      const state = new GoalState();
      state.set("X");
      expect(() => state.edit("")).toThrow("Objective is required");
    });

    it("edit rejects text over 4000 chars", () => {
      const state = new GoalState();
      state.set("X");
      expect(() => state.edit("x".repeat(4001))).toThrow("too long");
    });

    it("edit throws when idle", () => {
      const state = new GoalState();
      expect(() => state.edit("X")).toThrow("No active goal");
    });

    it("pause is a no-op when idle", () => {
      const state = new GoalState();
      state.pause();
      expect(state.getStatus()).toBe("idle");
    });

    it("pause is a no-op when already paused", () => {
      const state = new GoalState();
      state.set("X");
      state.pause();
      state.pause();
      expect(state.getStatus()).toBe("paused");
    });

    it("resume is a no-op when idle", () => {
      const state = new GoalState();
      state.resume();
      expect(state.getStatus()).toBe("idle");
    });

    it("resume is a no-op when already active", () => {
      const state = new GoalState();
      state.set("X");
      state.resume();
      expect(state.getStatus()).toBe("active");
    });

    it("evaluate throws when idle", () => {
      const state = new GoalState();
      expect(() => state.evaluate("E")).toThrow("No active goal");
    });

    it("evaluate records entry only when evidence is provided", () => {
      const state = new GoalState();
      state.set("X");
      state.evaluate(undefined, "Next");
      expect(state.getEntries()).toHaveLength(0);
      state.evaluate("Evidence", "Next");
      expect(state.getEntries()).toHaveLength(1);
    });

    it("evaluate rejects invalid status", () => {
      const state = new GoalState();
      state.set("X");
      expect(() => state.evaluate("", "", "complete" as any)).toThrow("Invalid evaluate status");
    });

    it("markBlocked throws when idle", () => {
      const state = new GoalState();
      expect(() => state.markBlocked("Reason")).toThrow("No active goal");
    });

    it("markBlocked rejects empty reason", () => {
      const state = new GoalState();
      state.set("X");
      expect(() => state.markBlocked("")).toThrow("Reason is required");
    });

    it("markComplete throws when idle", () => {
      const state = new GoalState();
      expect(() => state.markComplete("E")).toThrow("No active goal");
    });

    it("markComplete rejects empty evidence", () => {
      const state = new GoalState();
      state.set("X");
      expect(() => state.markComplete("")).toThrow("Evidence is required");
    });

    it("recordIteration is a no-op when idle", () => {
      const state = new GoalState();
      state.recordIteration();
      expect(state.get()).toBeNull();
    });

    it("updateUsage is a no-op when idle", () => {
      const state = new GoalState();
      state.updateUsage(100, 5000);
      expect(state.get()).toBeNull();
    });

    it("getEntries returns deep copies", () => {
      const state = new GoalState();
      state.set("X");
      state.evaluate("E", "N");
      const entries = state.getEntries();
      entries[0].evidence = "Mutated";
      expect(state.getEntries()[0].evidence).toBe("E");
    });

    it("fromSession skips non-custom entries", () => {
      const entries: SessionEntry[] = [
        { type: "message", message: { role: "toolResult", toolName: "goal", details: { goal: { id: "g1", text: "X", status: "active", startedAt: 1, updatedAt: 1, iteration: 0, tokensUsed: 0, timeUsedSeconds: 0 } } } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("fromSession skips custom entries with wrong customType", () => {
      const entries: SessionEntry[] = [
        { type: "custom", customType: "other", data: { goal: { id: "g1", text: "X", status: "active", startedAt: 1, updatedAt: 1, iteration: 0, tokensUsed: 0, timeUsedSeconds: 0 } } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("fromSession skips entries without data object", () => {
      const entries: SessionEntry[] = [
        { type: "custom", customType: "goal-state" },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("fromSession skips invalid goal shapes", () => {
      const entries: SessionEntry[] = [
        { type: "custom", customType: "goal-state", data: { goal: { text: "X", status: "active", startedAt: 1, updatedAt: 1, iteration: 0, tokensUsed: 0, timeUsedSeconds: 0 } } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("fromSession skips goal with invalid status", () => {
      const entries: SessionEntry[] = [
        { type: "custom", customType: "goal-state", data: { goal: { id: "g1", text: "X", status: "unknown", startedAt: 1, updatedAt: 1, iteration: 0, tokensUsed: 0, timeUsedSeconds: 0 } } },
      ];
      expect(GoalState.fromSession(entries).get()).toBeNull();
    });

    it("fromSession skips goal with wrong field types", () => {
      const base = { id: "g1", text: "X", status: "active", startedAt: 1, updatedAt: 1, iteration: 0, tokensUsed: 0, timeUsedSeconds: 0 };
      expect(GoalState.fromSession([{ type: "custom", customType: "goal-state", data: { goal: { ...base, id: 1 } } }]).get()).toBeNull();
      expect(GoalState.fromSession([{ type: "custom", customType: "goal-state", data: { goal: { ...base, text: 1 } } }]).get()).toBeNull();
      expect(GoalState.fromSession([{ type: "custom", customType: "goal-state", data: { goal: { ...base, startedAt: "1" } } }]).get()).toBeNull();
      expect(GoalState.fromSession([{ type: "custom", customType: "goal-state", data: { goal: { ...base, updatedAt: "1" } } }]).get()).toBeNull();
      expect(GoalState.fromSession([{ type: "custom", customType: "goal-state", data: { goal: { ...base, iteration: "0" } } }]).get()).toBeNull();
      expect(GoalState.fromSession([{ type: "custom", customType: "goal-state", data: { goal: { ...base, tokensUsed: "0" } } }]).get()).toBeNull();
      expect(GoalState.fromSession([{ type: "custom", customType: "goal-state", data: { goal: { ...base, timeUsedSeconds: "0" } } }]).get()).toBeNull();
      expect(GoalState.fromSession([{ type: "custom", customType: "goal-state", data: { goal: { ...base, blocker: 1 } } }]).get()).toBeNull();
      expect(GoalState.fromSession([{ type: "custom", customType: "goal-state", data: { goal: { ...base, lastEvidence: 1 } } }]).get()).toBeNull();
      expect(GoalState.fromSession([{ type: "custom", customType: "goal-state", data: { goal: { ...base, nextAction: 1 } } }]).get()).toBeNull();
    });

    it("evaluate updates nextAction only", () => {
      const state = new GoalState();
      state.set("X");
      const goal = state.evaluate(undefined, "Next");
      expect(goal.nextAction).toBe("Next");
    });

    it("evaluate updates lastEvidence only", () => {
      const state = new GoalState();
      state.set("X");
      const goal = state.evaluate("Evidence");
      expect(goal.lastEvidence).toBe("Evidence");
      expect(goal.nextAction).toBeUndefined();
    });
  });
});
