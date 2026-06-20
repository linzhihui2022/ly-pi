import { describe, it, expect } from "vitest";
import type {
  ActiveGoal,
  GoalEntry,
  GoalStateEntryData,
  GoalStatus,
} from "./types";

describe("types", () => {
  it("GoalStatus is the expected union", () => {
    const statuses: GoalStatus[] = ["active", "paused", "complete"];
    expect(statuses).toHaveLength(3);
    expect(statuses).toContain("active");
    expect(statuses).toContain("paused");
    expect(statuses).toContain("complete");
  });

  it("ActiveGoal has the required shape", () => {
    const goal: ActiveGoal = {
      id: "g1",
      text: "Refactor auth",
      status: "active",
      startedAt: 1,
      updatedAt: 2,
      iteration: 0,
      tokensUsed: 0,
      timeUsedSeconds: 0,
    };
    expect(goal.id).toBe("g1");
    expect(goal.text).toBe("Refactor auth");
    expect(goal.status).toBe("active");
    expect(goal.startedAt).toBe(1);
    expect(goal.updatedAt).toBe(2);
    expect(goal.iteration).toBe(0);
    expect(goal.tokensUsed).toBe(0);
    expect(goal.timeUsedSeconds).toBe(0);
    expect(goal.blocker).toBeUndefined();
  });

  it("ActiveGoal can include an optional blocker", () => {
    const goal: ActiveGoal = {
      id: "g2",
      text: "Fix bug",
      status: "paused",
      startedAt: 1,
      updatedAt: 2,
      iteration: 1,
      tokensUsed: 100,
      timeUsedSeconds: 30,
      blocker: "API down",
    };
    expect(goal.blocker).toBe("API down");
  });

  it("GoalEntry has the required shape", () => {
    const entry: GoalEntry = {
      iteration: 1,
      evidence: "Tests pass",
      nextAction: "Deploy",
      status: "active",
    };
    expect(entry.iteration).toBe(1);
    expect(entry.evidence).toBe("Tests pass");
    expect(entry.nextAction).toBe("Deploy");
    expect(entry.status).toBe("active");
  });

  it("GoalStateEntryData can hold an ActiveGoal", () => {
    const data: GoalStateEntryData = {
      goal: {
        id: "g3",
        text: "Refactor",
        status: "active",
        startedAt: 1,
        updatedAt: 2,
        iteration: 2,
        tokensUsed: 10,
        timeUsedSeconds: 30,
      },
    };
    expect(data.goal?.text).toBe("Refactor");
  });

  it("GoalStateEntryData can hold a null goal", () => {
    const data: GoalStateEntryData = { goal: null };
    expect(data.goal).toBeNull();
  });
});
