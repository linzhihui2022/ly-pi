# /goal Feature in my-todo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/goal` command, `goal` tool, auto-continue logic, and a `my-goal` widget to `pi-extensions/my-todo`, backed by a `GoalState` class persisted from session tool results.

**Architecture:** `GoalState` mirrors `TaskState`: it restores from the latest `toolName === "goal"` tool result and snapshots to tool `details`. `/goal` mutates state directly; the LLM uses the `goal` tool to record evidence and mark completion. `turn_end` tracks whether useful work happened; `agent_end` sends a follow-up when safe. `before_agent_start` injects goal context. UI is rendered by a dedicated overlay module.

**Tech Stack:** TypeScript, TypeBox, Vitest, Bun, Pi Extension API.

---

## Scope Check

This is a single subsystem inside `pi-extensions/my-todo`. No plan split needed.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `pi-extensions/my-todo/types.ts` | Add `GoalStatus`, `Goal`, `GoalDetails` types. |
| `pi-extensions/my-todo/goal-state.ts` | `GoalState` class: set/pause/resume/clear, evaluate/complete/block, persistence, auto-continue readiness. |
| `pi-extensions/my-todo/goal-state.test.ts` | Unit tests for `GoalState` (100% coverage target). |
| `pi-extensions/my-todo/goal-overlay.ts` | `renderGoalOverlay(goal, theme?)` widget renderer. |
| `pi-extensions/my-todo/goal-overlay.test.ts` | Unit tests for `renderGoalOverlay`. |
| `pi-extensions/my-todo/index.ts` | Wire `/goal` command, `goal` tool, lifecycle hooks, and widget refresh. |
| `pi-extensions/my-todo/index.test.ts` | Add integration tests for command, tool, hooks, widget. |

---

## Task 1: Extend `types.ts`

**Files:**
- Modify: `pi-extensions/my-todo/types.ts`
- Test: existing `state.test.ts` still passes

- [ ] **Step 1: Append Goal types**

Add at the end of `pi-extensions/my-todo/types.ts`:

```typescript
export type GoalStatus = "idle" | "active" | "paused" | "completed" | "blocked";

export interface Goal {
  objective: string;
  status: GoalStatus;
  iterationCount: number;
  lastEvidence: string;
  nextAction: string;
  blocker?: string;
}

export interface GoalDetails {
  goal: Goal;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd pi-extensions/my-todo && bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-todo/types.ts
git commit -m "feat(my-todo): add Goal types"
```

---

## Task 2: Implement `GoalState`

**Files:**
- Create: `pi-extensions/my-todo/goal-state.ts`
- Create: `pi-extensions/my-todo/goal-state.test.ts`

- [ ] **Step 1: Write failing tests**

Create `pi-extensions/my-todo/goal-state.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd pi-extensions/my-todo && bun test goal-state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `GoalState`**

Create `pi-extensions/my-todo/goal-state.ts`:

```typescript
import type { Goal, GoalStatus, SessionEntry } from "./types";

const VALID_GOAL_STATUSES: GoalStatus[] = ["idle", "active", "paused", "completed", "blocked"];
const VALID_EVALUATE_STATUSES: GoalStatus[] = ["active", "paused", "blocked"];

function isValidGoalStatus(value: unknown): value is GoalStatus {
  return typeof value === "string" && (VALID_GOAL_STATUSES as string[]).includes(value);
}

function isValidGoal(value: unknown): value is Goal {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.objective !== "string") return false;
  if (!isValidGoalStatus(obj.status)) return false;
  if (typeof obj.iterationCount !== "number") return false;
  if (typeof obj.lastEvidence !== "string") return false;
  if (typeof obj.nextAction !== "string") return false;
  if (obj.blocker !== undefined && typeof obj.blocker !== "string") return false;
  return true;
}

function deepCopyGoal(goal: Goal): Goal {
  return {
    objective: goal.objective,
    status: goal.status,
    iterationCount: goal.iterationCount,
    lastEvidence: goal.lastEvidence,
    nextAction: goal.nextAction,
    blocker: goal.blocker,
  };
}

export class GoalState {
  private goal: Goal | null = null;
  private hadUsefulWork = false;

  get(): Goal | null {
    return this.goal ? deepCopyGoal(this.goal) : null;
  }

  getStatus(): GoalStatus {
    return this.goal?.status ?? "idle";
  }

  isActive(): boolean {
    return this.goal?.status === "active";
  }

  canAutoContinue(): boolean {
    return this.isActive() && this.hadUsefulWork;
  }

  set(objective: string): Goal {
    const trimmed = objective.trim();
    if (trimmed === "") {
      throw new Error("Objective is required");
    }
    this.goal = {
      objective: trimmed,
      status: "active",
      iterationCount: 0,
      lastEvidence: "",
      nextAction: "",
    };
    this.hadUsefulWork = true;
    return deepCopyGoal(this.goal);
  }

  pause(): void {
    if (!this.goal) return;
    this.goal.status = "paused";
  }

  resume(): void {
    if (!this.goal) return;
    if (this.goal.status === "completed" || this.goal.status === "blocked") {
      throw new Error("Cannot resume a completed or blocked goal");
    }
    this.goal.status = "active";
  }

  clear(): void {
    this.goal = null;
    this.hadUsefulWork = false;
  }

  evaluate(lastEvidence?: string, nextAction?: string, status?: GoalStatus): Goal {
    if (!this.goal) throw new Error("No active goal");
    if (lastEvidence !== undefined) this.goal.lastEvidence = lastEvidence;
    if (nextAction !== undefined) this.goal.nextAction = nextAction;
    if (status !== undefined) {
      if (!VALID_EVALUATE_STATUSES.includes(status)) {
        throw new Error(`Invalid evaluate status: ${status}`);
      }
      this.goal.status = status;
    }
    return deepCopyGoal(this.goal);
  }

  markComplete(evidence: string): Goal {
    if (!this.goal) throw new Error("No active goal");
    if (evidence.trim() === "") throw new Error("Evidence is required");
    this.goal.status = "completed";
    this.goal.lastEvidence = evidence;
    this.goal.nextAction = "";
    return deepCopyGoal(this.goal);
  }

  markBlocked(reason: string, nextInputNeeded?: boolean): Goal {
    if (!this.goal) throw new Error("No active goal");
    if (reason.trim() === "") throw new Error("Reason is required");
    this.goal.status = "blocked";
    this.goal.blocker = reason;
    this.goal.nextAction = nextInputNeeded ? "Waiting for user input" : "";
    return deepCopyGoal(this.goal);
  }

  recordIteration(): void {
    if (!this.goal) return;
    this.goal.iterationCount += 1;
  }

  setHadUsefulWork(value: boolean): void {
    this.hadUsefulWork = value;
  }

  snapshot(): Goal | null {
    return this.goal ? deepCopyGoal(this.goal) : null;
  }

  static fromSession(entries: SessionEntry[]): GoalState {
    const state = new GoalState();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type !== "message") continue;
      if (entry.message?.role !== "toolResult") continue;
      if (entry.message.toolName !== "goal") continue;
      if (typeof entry.message.details !== "object" || entry.message.details === null) continue;
      const details = entry.message.details as Record<string, unknown>;
      if (!isValidGoal(details.goal)) continue;
      state.goal = deepCopyGoal(details.goal as Goal);
      break;
    }
    return state;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd pi-extensions/my-todo && bun test goal-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-todo/goal-state.ts pi-extensions/my-todo/goal-state.test.ts
git commit -m "feat(my-todo): add GoalState persistence"
```

---

## Task 3: Implement `renderGoalOverlay`

**Files:**
- Create: `pi-extensions/my-todo/goal-overlay.ts`
- Create: `pi-extensions/my-todo/goal-overlay.test.ts`

- [ ] **Step 1: Write failing tests**

Create `pi-extensions/my-todo/goal-overlay.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderGoalOverlay } from "./goal-overlay";
import type { Goal } from "./types";

const mockTheme = {
  fg: vi.fn((color: string, text: string) => `[${color}]${text}[/${color}]`),
  bold: vi.fn((text: string) => `**${text}**`),
};

beforeEach(() => {
  vi.clearAllMocks();
});

function makeGoal(partial: Partial<Goal> = {}): Goal {
  return {
    objective: "Refactor auth",
    status: "active",
    iterationCount: 0,
    lastEvidence: "",
    nextAction: "",
    ...partial,
  };
}

describe("renderGoalOverlay", () => {
  it("renders active goal without evidence", () => {
    const result = renderGoalOverlay(makeGoal());
    expect(result).toEqual([
      "Goal [active]",
      "Refactor auth",
    ]);
  });

  it("renders iterations when > 0", () => {
    const result = renderGoalOverlay(makeGoal({ iterationCount: 3 }));
    expect(result).toContain("Iterations: 3");
  });

  it("renders evidence summary", () => {
    const result = renderGoalOverlay(makeGoal({ lastEvidence: "Tests pass" }));
    expect(result).toContain("Evidence: Tests pass");
  });

  it("truncates long objective", () => {
    const long = "a".repeat(50);
    const result = renderGoalOverlay(makeGoal({ objective: long }));
    expect(result[1]).toBe(long.slice(0, 37) + "...");
  });

  it("truncates long evidence", () => {
    const long = "b".repeat(50);
    const result = renderGoalOverlay(makeGoal({ lastEvidence: long }));
    const evidenceLine = result.find((l) => l.startsWith("Evidence:" ));
    expect(evidenceLine).toContain("...");
  });

  it("renders paused status", () => {
    const result = renderGoalOverlay(makeGoal({ status: "paused" }));
    expect(result[0]).toBe("Goal [paused]");
  });

  it("renders completed status", () => {
    const result = renderGoalOverlay(makeGoal({ status: "completed" }));
    expect(result[0]).toBe("Goal [completed]");
  });

  it("renders blocked status with blocker", () => {
    const result = renderGoalOverlay(makeGoal({ status: "blocked", blocker: "API down" }));
    expect(result[0]).toBe("Goal [blocked]");
    expect(result).toContain("Blocker: API down");
  });

  it("styles title with theme", () => {
    renderGoalOverlay(makeGoal(), mockTheme);
    expect(mockTheme.bold).toHaveBeenCalledWith("Goal [active]");
    expect(mockTheme.fg).toHaveBeenCalledWith("accent", expect.stringContaining("Goal [active]"));
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd pi-extensions/my-todo && bun test goal-overlay.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement renderer**

Create `pi-extensions/my-todo/goal-overlay.ts`:

```typescript
import type { Goal, GoalStatus } from "./types";

interface ThemeLike {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

const STATUS_COLORS: Record<GoalStatus, string> = {
  idle: "dim",
  active: "accent",
  paused: "muted",
  completed: "muted",
  blocked: "error",
};

function truncate(text: string, max = 40): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

export function renderGoalOverlay(goal: Goal, theme?: ThemeLike): string[] {
  const lines: string[] = [];
  const title = `Goal [${goal.status}]`;
  const titleText = theme ? theme.fg(STATUS_COLORS[goal.status], theme.bold(title)) : title;
  lines.push(titleText);
  lines.push(theme ? theme.fg("dim", truncate(goal.objective)) : truncate(goal.objective));

  if (goal.iterationCount > 0) {
    const it = `Iterations: ${goal.iterationCount}`;
    lines.push(theme ? theme.fg("dim", it) : it);
  }

  if (goal.lastEvidence.trim()) {
    const ev = `Evidence: ${truncate(goal.lastEvidence)}`;
    lines.push(theme ? theme.fg("dim", ev) : ev);
  }

  if (goal.blocker) {
    const block = `Blocker: ${truncate(goal.blocker)}`;
    lines.push(theme ? theme.fg("error", block) : block);
  }

  return lines;
}
```

- [ ] **Step 4: Run tests**

Run: `cd pi-extensions/my-todo && bun test goal-overlay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-todo/goal-overlay.ts pi-extensions/my-todo/goal-overlay.test.ts
git commit -m "feat(my-todo): add goal widget overlay"
```

---

## Task 4: Register `/goal` command and `goal` tool

**Files:**
- Modify: `pi-extensions/my-todo/index.ts`
- Modify: `pi-extensions/my-todo/index.test.ts`

- [ ] **Step 1: Update test harness**

In `pi-extensions/my-todo/index.test.ts`, update the top-level mocks:

```typescript
const mockPi = {
  on: vi.fn((event: string, handler: (...args: any[]) => any) => {
    registeredEvents.set(event, handler);
  }),
  registerTool: vi.fn((def: any) => {
    registeredTools.push(def);
  }),
  registerCommand: vi.fn((name: string, options: any) => {
    registeredCommands.set(name, options);
  }),
  registerShortcut: vi.fn((_key: any, _options: any) => {}),
  sendUserMessage: vi.fn(),
};
```

And update `createMockCtx`:

```typescript
const createMockCtx = (entries: any[] = []) => ({
  hasUI: true,
  ui: {
    setWidget: vi.fn((_name: string, _factory?: unknown) => {
      widgetLines.push(undefined);
    }),
    notify: vi.fn(),
    select: vi.fn(),
  },
  sessionManager: {
    getEntries: vi.fn(() => entries),
  },
  isIdle: vi.fn(() => true),
  hasPendingMessages: vi.fn(() => false),
});
```

- [ ] **Step 2: Add integration tests for command and tool**

Append to `pi-extensions/my-todo/index.test.ts` inside the final `describe("my-todo extension", () => {...})` block:

```typescript
describe("/goal command", () => {
  it("registers goal tool", async () => {
    await initExtension();
    expect(mockPi.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "goal" })
    );
  });

  it("registers /goal command", async () => {
    await initExtension();
    expect(mockPi.registerCommand).toHaveBeenCalledWith(
      "goal",
      expect.any(Object)
    );
  });

  it("sets goal", async () => {
    await initExtension();
    const cmd = registeredCommands.get("goal")!;
    const ctx = createMockCtx();
    await cmd.handler("Refactor auth", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Goal set"),
      "info"
    );
  });

  it("rejects empty objective", async () => {
    await initExtension();
    const cmd = registeredCommands.get("goal")!;
    const ctx = createMockCtx();
    await cmd.handler("   ", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Usage"),
      "warning"
    );
  });

  it("shows status", async () => {
    await initExtension();
    const cmd = registeredCommands.get("goal")!;
    const ctx = createMockCtx();
    await cmd.handler("Refactor auth", ctx);
    ctx.ui.notify.mockClear();
    await cmd.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Refactor auth"),
      "info"
    );
  });

  it("pauses and resumes", async () => {
    await initExtension();
    const cmd = registeredCommands.get("goal")!;
    const ctx = createMockCtx();
    await cmd.handler("Refactor auth", ctx);
    await cmd.handler("pause", ctx);
    ctx.ui.notify.mockClear();
    await cmd.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("paused"),
      "info"
    );
    await cmd.handler("resume", ctx);
    ctx.ui.notify.mockClear();
    await cmd.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("active"),
      "info"
    );
  });

  it("clears goal", async () => {
    await initExtension();
    const cmd = registeredCommands.get("goal")!;
    const ctx = createMockCtx();
    await cmd.handler("Refactor auth", ctx);
    await cmd.handler("clear", ctx);
    ctx.ui.notify.mockClear();
    await cmd.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "No active goal.",
      "info"
    );
  });
});

describe("goal tool", () => {
  async function getGoalTool() {
    await initExtension();
    return registeredTools.find((t) => t.name === "goal")!;
  }

  it("evaluate updates evidence", async () => {
    const tool = await getGoalTool();
    const ctx = createMockCtx();
    const cmd = registeredCommands.get("goal")!;
    await cmd.handler("Refactor auth", ctx);

    const result = await tool.execute("tc-1", { action: "evaluate", lastEvidence: "Tests pass", nextAction: "Deploy" }, undefined, undefined, ctx);
    expect(result.content[0].text).toContain("Tests pass");
    expect(result.details.goal.lastEvidence).toBe("Tests pass");
  });

  it("mark_complete requires evidence", async () => {
    const tool = await getGoalTool();
    const ctx = createMockCtx();
    const cmd = registeredCommands.get("goal")!;
    await cmd.handler("Refactor auth", ctx);

    const result = await tool.execute("tc-1", { action: "mark_complete" }, undefined, undefined, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Evidence is required");
  });

  it("mark_complete completes goal", async () => {
    const tool = await getGoalTool();
    const ctx = createMockCtx();
    const cmd = registeredCommands.get("goal")!;
    await cmd.handler("Refactor auth", ctx);

    const result = await tool.execute("tc-1", { action: "mark_complete", evidence: "CI green" }, undefined, undefined, ctx);
    expect(result.details.goal.status).toBe("completed");
  });

  it("mark_blocked requires reason", async () => {
    const tool = await getGoalTool();
    const ctx = createMockCtx();
    const cmd = registeredCommands.get("goal")!;
    await cmd.handler("Refactor auth", ctx);

    const result = await tool.execute("tc-1", { action: "mark_blocked" }, undefined, undefined, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Reason is required");
  });

  it("mark_blocked blocks goal", async () => {
    const tool = await getGoalTool();
    const ctx = createMockCtx();
    const cmd = registeredCommands.get("goal")!;
    await cmd.handler("Refactor auth", ctx);

    const result = await tool.execute("tc-1", { action: "mark_blocked", reason: "API down" }, undefined, undefined, ctx);
    expect(result.details.goal.status).toBe("blocked");
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `cd pi-extensions/my-todo && bun test index.test.ts`
Expected: FAIL — goal command/tool not found, tests for goal fail.

- [ ] **Step 4: Wire command and tool into `index.ts`**

Modify `pi-extensions/my-todo/index.ts`:

1. Add imports at the top:

```typescript
import { GoalState } from "./goal-state";
import { renderGoalOverlay } from "./goal-overlay";
import type { GoalStatus } from "./types";
```

2. Inside `myTodo`, add state below `let state = new TaskState();`:

```typescript
let goalState = new GoalState();
```

3. Update `refreshWidgets` to also render the goal widget. Insert after the existing todo widget logic but before the function closes:

```typescript
const goal = goalState.get();
if (goal) {
  ctx.ui.setWidget("my-goal", (_tui, theme) => ({
    render: () => renderGoalOverlay(goal, theme),
    invalidate: () => {},
  }));
} else {
  ctx.ui.setWidget("my-goal", undefined);
}
```

4. Register the `goal` tool after the `todo` tool registration block. Add:

```typescript
pi.registerTool({
  name: "goal",
  label: "Goal",
  description: "Track long-horizon objectives and autonomous progress. Actions: evaluate, mark_complete, mark_blocked.",
  promptSnippet: "Track long-term goals and evidence of completion",
  promptGuidelines: [
    "Use the goal tool to record evidence, update the next step, and mark the goal complete only when verified.",
    "Call mark_complete only when you have concrete evidence the objective is satisfied.",
    "Call mark_blocked when no valid path remains and explain why.",
  ],
  parameters: Type.Object({
    action: StringEnum(["evaluate", "mark_complete", "mark_blocked"] as const),
    lastEvidence: Type.Optional(Type.String()),
    nextAction: Type.Optional(Type.String()),
    status: Type.Optional(StringEnum(["active", "paused", "blocked"] as const)),
    evidence: Type.Optional(Type.String()),
    reason: Type.Optional(Type.String()),
    nextInputNeeded: Type.Optional(Type.Boolean()),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    try {
      switch (params.action) {
        case "evaluate": {
          const goal = goalState.evaluate(params.lastEvidence, params.nextAction, params.status as GoalStatus | undefined);
          refreshWidgets(ctx);
          return {
            content: [{ type: "text", text: `Goal updated. Status: ${goal.status}, evidence: ${goal.lastEvidence || "(none)"}, next: ${goal.nextAction || "(none)"}` }],
            details: { goal: goalState.snapshot() },
          };
        }
        case "mark_complete": {
          const goal = goalState.markComplete(params.evidence ?? "");
          refreshWidgets(ctx);
          return {
            content: [{ type: "text", text: `Goal completed: ${goal.objective}` }],
            details: { goal: goalState.snapshot() },
          };
        }
        case "mark_blocked": {
          const goal = goalState.markBlocked(params.reason ?? "", params.nextInputNeeded);
          refreshWidgets(ctx);
          return {
            content: [{ type: "text", text: `Goal blocked: ${goal.blocker}` }],
            details: { goal: goalState.snapshot() },
          };
        }
        default: {
          const _exhaustive: never = params.action;
          throw new Error(`Unknown action: ${_exhaustive}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        details: { goal: goalState.snapshot() },
        isError: true,
      };
    }
  },
});
```

5. Register the `/goal` command after the `/todos` command. Add:

```typescript
pi.registerCommand("goal", {
  description: "Set or manage a long-term objective: /goal [objective|pause|resume|clear]",
  handler: async (args, ctx) => {
    const trimmed = (args ?? "").trim();

    if (trimmed === "") {
      const goal = goalState.get();
      if (!goal) {
        ctx.ui.notify("No active goal.", "info");
        return;
      }
      const lines = [
        `Goal [${goal.status}]: ${goal.objective}`,
        `Iterations: ${goal.iterationCount}`,
        `Evidence: ${goal.lastEvidence || "(none)"}`,
      ];
      if (goal.blocker) lines.push(`Blocker: ${goal.blocker}`);
      ctx.ui.notify(lines.join("\n"), "info");
      return;
    }

    const [first, ...rest] = trimmed.split(/\s+/);
    const restJoined = rest.join(" ").trim();

    if (first === "pause" && restJoined === "") {
      if (!goalState.get()) {
        ctx.ui.notify("No active goal to pause.", "warning");
        return;
      }
      goalState.pause();
      refreshWidgets(ctx);
      ctx.ui.notify("Goal paused.", "info");
      return;
    }

    if (first === "resume" && restJoined === "") {
      if (!goalState.get()) {
        ctx.ui.notify("No active goal to resume.", "warning");
        return;
      }
      try {
        goalState.resume();
        refreshWidgets(ctx);
        ctx.ui.notify("Goal resumed.", "info");
      } catch (err) {
        ctx.ui.notify(err instanceof Error ? err.message : String(err), "error");
      }
      return;
    }

    if (first === "clear" && restJoined === "") {
      if (!goalState.get()) {
        ctx.ui.notify("No goal to clear.", "info");
        return;
      }
      goalState.clear();
      refreshWidgets(ctx);
      ctx.ui.notify("Goal cleared.", "info");
      return;
    }

    goalState.set(trimmed);
    refreshWidgets(ctx);
    ctx.ui.notify(`Goal set: ${trimmed}`, "info");
  },
});
```

- [ ] **Step 5: Run tests**

Run: `cd pi-extensions/my-todo && bun test index.test.ts`
Expected: PASS for new tests; existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add pi-extensions/my-todo/index.ts pi-extensions/my-todo/index.test.ts
git commit -m "feat(my-todo): add /goal command and goal tool"
```

---

## Task 5: Inject goal context in `before_agent_start`

**Files:**
- Modify: `pi-extensions/my-todo/index.ts`
- Modify: `pi-extensions/my-todo/index.test.ts`

- [ ] **Step 1: Add tests**

Append to `pi-extensions/my-todo/index.test.ts`:

```typescript
describe("before_agent_start goal prompt", () => {
  it("injects active goal context", async () => {
    await initExtension();
    const cmd = registeredCommands.get("goal")!;
    const ctx = createMockCtx();
    await cmd.handler("Refactor auth", ctx);

    const handler = registeredEvents.get("before_agent_start")!;
    const result = await handler({}, ctx);
    expect(result).toBeDefined();
    expect(result.message.display).toBe(false);
    expect(result.message.content).toContain("Refactor auth");
    expect(result.message.content).toContain("Use the goal tool");
  });

  it("does not inject when goal is idle", async () => {
    await initExtension();
    const handler = registeredEvents.get("before_agent_start")!;
    const ctx = createMockCtx();
    const result = await handler({}, ctx);
    expect(result).toBeUndefined();
  });

  it("injects summary prompt for completed goal", async () => {
    await initExtension();
    const cmd = registeredCommands.get("goal")!;
    const ctx = createMockCtx();
    await cmd.handler("Refactor auth", ctx);
    const tool = registeredTools.find((t) => t.name === "goal")!;
    await tool.execute("tc-1", { action: "mark_complete", evidence: "Done" }, undefined, undefined, ctx);

    const handler = registeredEvents.get("before_agent_start")!;
    const result = await handler({}, ctx);
    expect(result.message.content).toContain("completed");
    expect(result.message.content).toContain("Key evidence");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd pi-extensions/my-todo && bun test index.test.ts`
Expected: FAIL — before_agent_start does not return goal message.

- [ ] **Step 3: Update `before_agent_start` handler**

In `pi-extensions/my-todo/index.ts`, replace the existing `pi.on("before_agent_start", ...)` block with:

```typescript
pi.on("before_agent_start", async (_event, _ctx) => {
  if (state.getPlanMode()) {
    if (state.getPlanPhase() === "planning") {
      return {
        message: {
          customType: "hidden",
          content: "You are in plan mode. You can only use the following planning tools: read, bash (note: bash can execute commands, including destructive ones, so use it carefully), grep, find, ls, ask_user_question, web_search, web_fetch. Use the todo tool to create a task list for the plan. Do not modify any files. Do not use edit, write, or any other modifying tools. Ask the user questions with ask_user_question if you need clarification.",
          display: false,
        },
      };
    }

    if (state.getPlanPhase() === "executing") {
      const tasks = state.list();
      const taskList = tasks.map((t) => `#${t.id} [${t.status}] ${t.subject}`).join("\n");
      return {
        message: {
          customType: "hidden",
          content: `You are now executing the plan. Work through each task in order using the todo tool to mark progress. Mark tasks in_progress before beginning work on them. Mark tasks completed only when fully done.\n\nCurrent tasks:\n${taskList || "(none)"}`,
          display: false,
        },
      };
    }
  }

  const goal = goalState.get();
  if (!goal) return;

  if (goal.status === "active") {
    return {
      message: {
        customType: "hidden",
        content: `You are working toward a goal:\n${goal.objective}\n\nCurrent status: ${goal.status}\nIterations so far: ${goal.iterationCount}\nLast evidence: ${goal.lastEvidence || "(none)"}\n\nWhat "done" means and how to verify it should be inferred from the goal text and the conversation so far. Use the goal tool to evaluate progress, record evidence, update the next step, mark complete when verified, or mark blocked when no valid path remains.`,
        display: false,
      },
    };
  }

  if (goal.status === "completed" || goal.status === "blocked") {
    return {
      message: {
        customType: "hidden",
        content: `The goal has reached status: ${goal.status}.\n\nPlease summarize in your final response:\n- Whether the goal was achieved\n- Key evidence\n- Summary of changes made\n${goal.status === "blocked" ? `- Blocker: ${goal.blocker || "(unknown)"}` : ""}`,
        display: false,
      },
    };
  }
});
```

- [ ] **Step 4: Run tests**

Run: `cd pi-extensions/my-todo && bun test index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-todo/index.ts pi-extensions/my-todo/index.test.ts
git commit -m "feat(my-todo): inject goal context before agent start"
```

---

## Task 6: Implement auto-continue on `agent_end`

**Files:**
- Modify: `pi-extensions/my-todo/index.ts`
- Modify: `pi-extensions/my-todo/index.test.ts`

- [ ] **Step 1: Add tests**

Append to `pi-extensions/my-todo/index.test.ts`:

```typescript
describe("agent_end auto-continue", () => {
  async function setupActiveGoal() {
    await initExtension();
    const ctx = createMockCtx();
    const cmd = registeredCommands.get("goal")!;
    await cmd.handler("Refactor auth", ctx);
    return ctx;
  }

  function fireTurnEnd(ctx: any, toolCount: number) {
    const handler = registeredEvents.get("turn_end")!;
    return handler({ type: "turn_end", turnIndex: 1, message: {}, toolResults: Array(toolCount).fill({}) }, ctx);
  }

  it("sends follow-up when active, idle, and tools ran", async () => {
    const ctx = await setupActiveGoal();
    await fireTurnEnd(ctx, 1);

    const handler = registeredEvents.get("agent_end")!;
    await handler({ type: "agent_end", messages: [] }, ctx);

    expect(mockPi.sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining("Continue working toward the goal"),
      { deliverAs: "followUp" }
    );
  });

  it("sends custom nextAction when set", async () => {
    const ctx = await setupActiveGoal();
    const tool = registeredTools.find((t) => t.name === "goal")!;
    await tool.execute("tc-1", { action: "evaluate", nextAction: "Run migration" }, undefined, undefined, ctx);
    await fireTurnEnd(ctx, 1);

    const handler = registeredEvents.get("agent_end")!;
    await handler({ type: "agent_end", messages: [] }, ctx);

    expect(mockPi.sendUserMessage).toHaveBeenCalledWith("Run migration", { deliverAs: "followUp" });
  });

  it("does not auto-continue when paused", async () => {
    const ctx = await setupActiveGoal();
    const cmd = registeredCommands.get("goal")!;
    await cmd.handler("pause", ctx);
    await fireTurnEnd(ctx, 1);

    const handler = registeredEvents.get("agent_end")!;
    await handler({ type: "agent_end", messages: [] }, ctx);

    expect(mockPi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("does not auto-continue when completed", async () => {
    const ctx = await setupActiveGoal();
    const tool = registeredTools.find((t) => t.name === "goal")!;
    await tool.execute("tc-1", { action: "mark_complete", evidence: "Done" }, undefined, undefined, ctx);
    await fireTurnEnd(ctx, 1);

    const handler = registeredEvents.get("agent_end")!;
    await handler({ type: "agent_end", messages: [] }, ctx);

    expect(mockPi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("does not auto-continue when blocked", async () => {
    const ctx = await setupActiveGoal();
    const tool = registeredTools.find((t) => t.name === "goal")!;
    await tool.execute("tc-1", { action: "mark_blocked", reason: "Stuck" }, undefined, undefined, ctx);
    await fireTurnEnd(ctx, 1);

    const handler = registeredEvents.get("agent_end")!;
    await handler({ type: "agent_end", messages: [] }, ctx);

    expect(mockPi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("does not auto-continue when no tools ran", async () => {
    const ctx = await setupActiveGoal();
    await fireTurnEnd(ctx, 0);

    const handler = registeredEvents.get("agent_end")!;
    await handler({ type: "agent_end", messages: [] }, ctx);

    expect(mockPi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("does not auto-continue when pending messages exist", async () => {
    const ctx = await setupActiveGoal();
    ctx.hasPendingMessages = vi.fn(() => true);
    await fireTurnEnd(ctx, 1);

    const handler = registeredEvents.get("agent_end")!;
    await handler({ type: "agent_end", messages: [] }, ctx);

    expect(mockPi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("does not auto-continue in planning phase", async () => {
    const ctx = await setupActiveGoal();
    const cmd = registeredCommands.get("todos")!;
    await cmd.handler("plan", ctx);
    await fireTurnEnd(ctx, 1);

    const handler = registeredEvents.get("agent_end")!;
    await handler({ type: "agent_end", messages: [] }, ctx);

    expect(mockPi.sendUserMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd pi-extensions/my-todo && bun test index.test.ts`
Expected: FAIL — auto-continue not implemented.

- [ ] **Step 3: Implement `turn_end` tracking and `agent_end` follow-up**

In `pi-extensions/my-todo/index.ts`:

1. Update the `turn_end` handler to track useful work and refresh goal widget. Replace the existing `pi.on("turn_end", ...)` body with:

```typescript
pi.on("turn_end", async (event, ctx) => {
  refreshWidgets(ctx);
  goalState.setHadUsefulWork(event.toolResults.length > 0);

  // Auto-exit plan mode when all tasks are completed during execution
  if (state.getPlanMode() && state.getPlanPhase() === "executing") {
    const tasks = state.list();
    if (tasks.length > 0 && tasks.every((t) => t.status === "completed")) {
      state.setPlanMode(false, "idle");
      refreshWidgets(ctx);
      ctx.ui.notify("Plan complete. All tasks finished.", "info");
    }
  }
});
```

2. Update the `agent_end` handler to include goal auto-continue. Replace the existing `pi.on("agent_end", ...)` block with:

```typescript
pi.on("agent_end", async (_event, ctx) => {
  if (state.getPlanMode() && state.getPlanPhase() === "planning") {
    if (!ctx.hasUI) return;

    const tasks = state.list();
    if (tasks.length === 0) return;

    const choice = await ctx.ui.select(
      "Plan Complete",
      ["Execute plan", "Continue planning", "Discard plan"],
    );

    if (choice === "Execute plan") {
      state.setPlanMode(true, "executing");
      refreshWidgets(ctx);
    } else if (choice === "Discard plan") {
      state.clear();
      state.setPlanMode(false, "idle");
      refreshWidgets(ctx);
    }
    return;
  }

  if (!goalState.canAutoContinue()) return;
  if (!ctx.isIdle()) return;
  if (ctx.hasPendingMessages()) return;

  goalState.recordIteration();
  const goal = goalState.get()!;
  const message = goal.nextAction.trim()
    ? goal.nextAction
    : `Continue working toward the goal: ${goal.objective}\n\nEvaluate progress against what "done" means for this goal, then choose the next useful action. Use the goal tool to record evidence and update the next step. Mark complete only when verified.`;

  pi.sendUserMessage(message, { deliverAs: "followUp" });
});
```

- [ ] **Step 4: Run tests**

Run: `cd pi-extensions/my-todo && bun test index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-todo/index.ts pi-extensions/my-todo/index.test.ts
git commit -m "feat(my-todo): auto-continue active goals on agent_end"
```

---

## Task 7: Pause on user input and widget refresh

**Files:**
- Modify: `pi-extensions/my-todo/index.ts`
- Modify: `pi-extensions/my-todo/index.test.ts`

- [ ] **Step 1: Add tests**

Append to `pi-extensions/my-todo/index.test.ts`:

```typescript
describe("goal input pause", () => {
  it("pauses active goal on ordinary user input", async () => {
    await initExtension();
    const cmd = registeredCommands.get("goal")!;
    const ctx = createMockCtx();
    await cmd.handler("Refactor auth", ctx);

    const handler = registeredEvents.get("input")!;
    const result = await handler({ type: "input", text: "What about this?", source: "interactive" }, ctx);
    expect(result).toBeUndefined();

    const status = registeredCommands.get("goal")!;
    ctx.ui.notify.mockClear();
    await status.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("paused"),
      "info"
    );
  });

  it("does not pause on /goal input", async () => {
    await initExtension();
    const cmd = registeredCommands.get("goal")!;
    const ctx = createMockCtx();
    await cmd.handler("Refactor auth", ctx);

    const handler = registeredEvents.get("input")!;
    await handler({ type: "input", text: "/goal check", source: "interactive" }, ctx);

    ctx.ui.notify.mockClear();
    await cmd.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("active"),
      "info"
    );
  });
});

describe("goal widget", () => {
  it("renders goal widget after set", async () => {
    await initExtension();
    const cmd = registeredCommands.get("goal")!;
    const ctx = createMockCtx();
    await cmd.handler("Refactor auth", ctx);
    expect(ctx.ui.setWidget).toHaveBeenCalledWith("my-goal", expect.any(Function));
  });

  it("clears goal widget after clear", async () => {
    await initExtension();
    const cmd = registeredCommands.get("goal")!;
    const ctx = createMockCtx();
    await cmd.handler("Refactor auth", ctx);
    ctx.ui.setWidget.mockClear();
    await cmd.handler("clear", ctx);
    expect(ctx.ui.setWidget).toHaveBeenCalledWith("my-goal", undefined);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd pi-extensions/my-todo && bun test index.test.ts`
Expected: FAIL — input handler missing.

- [ ] **Step 3: Add `input` handler and ensure widget refresh**

In `pi-extensions/my-todo/index.ts`:

1. The `refreshWidgets` function already includes goal widget logic from Task 4. Verify it is present.

2. Register the `input` handler. Add after the `agent_end` handler:

```typescript
pi.on("input", async (event, _ctx) => {
  if (event.source !== "interactive" && event.source !== "rpc") return;
  if (event.text.trim().startsWith("/goal")) return;
  if (goalState.isActive()) {
    goalState.pause();
  }
});
```

- [ ] **Step 4: Run tests**

Run: `cd pi-extensions/my-todo && bun test index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-todo/index.ts pi-extensions/my-todo/index.test.ts
git commit -m "feat(my-todo): pause goal on user input and render goal widget"
```

---

## Task 8: Full verification, build, and deploy

**Files:**
- All of the above.

- [ ] **Step 1: Run full test suite with coverage**

Run: `cd pi-extensions/my-todo && bun test`
Expected: all tests pass; branches/functions/lines/statements at 100%.

If coverage is missing:
- Inspect `coverage/index.html` or terminal output.
- Add tests for uncovered branches (e.g., error paths, idle/no-op branches).
- Re-run until 100%.

- [ ] **Step 2: Typecheck**

Run: `cd pi-extensions/my-todo && bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `cd pi-extensions/my-todo && bun run build`
Expected: `dist/index.js` created without errors.

- [ ] **Step 4: Deploy and reload**

Run: `cd pi-extensions/my-todo && bun run deploy`
Then in Pi: `/reload`

- [ ] **Step 5: Manual smoke test**

In Pi:
1. `/goal Refactor the todo extension`
2. Observe `my-goal` widget appears.
3. Ask the agent to evaluate progress; verify `goal` tool records evidence.
4. `/goal pause` then `/goal resume`.
5. `/goal clear`; verify widget disappears.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(my-todo): complete /goal long-horizon objective support"
```

---

## Self-Review

**Spec coverage:**
- `/goal` command set/pause/resume/clear/status → Task 4
- `goal` tool evaluate/mark_complete/mark_blocked → Task 4
- `GoalState.fromSession` persistence → Task 2
- `agent_end` auto-continue with conditions → Task 6
- `before_agent_start` prompt injection → Task 5
- Widget rendering → Task 3 + 7
- Input pause behavior → Task 7
- Evidence-driven completion → Task 2 + 4

**Placeholder scan:**
- No TBD/TODO/fill-in details.
- All code blocks are complete and runnable.
- No vague "handle edge cases" steps.

**Type consistency:**
- `GoalStatus` used consistently across `types.ts`, `goal-state.ts`, `goal-overlay.ts`, and `index.ts`.
- Tool parameter `status` narrowed to `"active" | "paused" | "blocked"` for `evaluate`.
- `GoalDetails.details.goal` shape consistent everywhere.

---

## Execution Handoff

**Plan complete and saved to `.lychee/artifacts/plans/2026-06-19-goal-in-my-todo.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?
