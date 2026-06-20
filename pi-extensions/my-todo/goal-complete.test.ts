import { describe, it, expect, vi } from "vitest";
import { createGoalCompleteTool } from "./goal-complete";
import { GoalState } from "./goal-state";

function makeTool(state: GoalState) {
  return createGoalCompleteTool(state, {
    persistGoal: vi.fn(),
    clearStatus: vi.fn(),
    notify: vi.fn(),
  });
}

describe("goal_complete tool", () => {
  it("completes active goal", async () => {
    const state = new GoalState();
    state.set("Fix bug");
    const persist = vi.fn();
    const clearStatus = vi.fn();
    const notify = vi.fn();
    const tool = createGoalCompleteTool(state, {
      persistGoal: persist,
      clearStatus,
      notify,
    });

    const result = await tool.execute(
      "id-1",
      { summary: "Tests pass" },
      undefined,
      undefined,
      {
        ui: { setStatus: vi.fn(), notify },
      } as any,
    );

    expect(result.terminate).toBe(true);
    expect(result.content[0].text).toContain("Goal complete");
    expect(state.get()?.status).toBe("complete");
    expect(persist).toHaveBeenCalledWith(null);
    expect(notify).toHaveBeenCalled();
  });

  it("errors when no active goal", async () => {
    const state = new GoalState();
    const tool = makeTool(state);
    const result = await tool.execute(
      "id-1",
      { summary: "Done" },
      undefined,
      undefined,
      { ui: { setStatus: vi.fn(), notify: vi.fn() } } as any,
    );
    expect(result.isError).toBe(true);
    expect(result.terminate).toBeUndefined();
  });

  it("errors when summary empty", async () => {
    const state = new GoalState();
    state.set("Fix bug");
    const tool = makeTool(state);
    const result = await tool.execute(
      "id-1",
      { summary: "" },
      undefined,
      undefined,
      { ui: { setStatus: vi.fn(), notify: vi.fn() } } as any,
    );
    expect(result.isError).toBe(true);
  });

  it("errors when goal is paused", async () => {
    const state = new GoalState();
    state.set("Fix bug");
    state.pause();
    const tool = makeTool(state);
    const result = await tool.execute(
      "id-1",
      { summary: "Done" },
      undefined,
      undefined,
      { ui: { setStatus: vi.fn(), notify: vi.fn() } } as any,
    );
    expect(result.isError).toBe(true);
    expect(result.terminate).toBeUndefined();
  });
});
