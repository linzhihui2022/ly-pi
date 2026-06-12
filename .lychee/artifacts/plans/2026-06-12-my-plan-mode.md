# my-plan-mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Plan Mode to the existing my-todo extension that puts the agent into a read-only exploration state for creating task plans, then executes them with full tools after user confirmation.

**Architecture:** Extend `TaskState` with `planMode`/`planPhase` fields persisted through `todo` tool result details. Use `before_agent_start` to inject hidden system prompts, `tool_call` to block write tools in planning phase, and `agent_end` to prompt user for next action.

**Tech Stack:** TypeScript, typebox/pi-ai for schema, vitest for testing, pi SDK (ExtensionAPI events: before_agent_start, tool_call, agent_end, session_start, turn_start, turn_end)

---

## File Structure

```
pi-extensions/my-todo/
├── types.ts          → Add PlanPhase type
├── state.ts          → Add planMode/planPhase to TaskState; update snapshot/fromSession/isValidDetails
├── overlay.ts        → Add plan-mode-aware widget rendering
├── index.ts          → Wire up commands, events, shortcuts, tool whitelist
├── state.test.ts     → Tests for plan-mode state persistence
├── overlay.test.ts   → Tests for plan-mode widget labels
├── index.test.ts     → Tests for plan commands, tool whitelist, agent_end dialog
```

---

### Task 1: Add PlanPhase type to types.ts

**Files:**
- Modify: `pi-extensions/my-todo/types.ts`

- [ ] **Step 1: Add PlanPhase type**

```ts
export type PlanPhase = "idle" | "planning" | "executing";
```

Add it after the `TaskAction` type line.

- [ ] **Step 2: Verify types compile**

Run: `cd pi-extensions/my-todo && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-todo/types.ts
git commit -m "feat(my-todo): add PlanPhase type"
```

---

### Task 2: Extend TaskState with planMode/planPhase in state.ts

**Files:**
- Modify: `pi-extensions/my-todo/state.ts`

- [ ] **Step 1: Write the failing tests**

In `pi-extensions/my-todo/state.test.ts`, append these tests:

```ts
import type { PlanPhase } from "./types";

describe("TaskState plan mode", () => {
  it("defaults to planMode=false, planPhase=idle", () => {
    const state = new TaskState();
    expect(state.getPlanMode()).toBe(false);
    expect(state.getPlanPhase()).toBe("idle");
  });

  it("setPlanMode sets planMode and planPhase", () => {
    const state = new TaskState();
    state.setPlanMode(true, "planning");
    expect(state.getPlanMode()).toBe(true);
    expect(state.getPlanPhase()).toBe("planning");
  });

  it("snapshot includes planMode and planPhase", () => {
    const state = new TaskState();
    state.create("A");
    state.setPlanMode(true, "planning");
    const snap = state.snapshot();
    expect(snap.planMode).toBe(true);
    expect(snap.planPhase).toBe("planning");
  });

  it("fromSession restores planMode and planPhase", () => {
    const entries: SessionEntry[] = [
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: "todo",
          details: {
            tasks: [{ id: 1, subject: "A", status: "pending" }],
            nextId: 2,
            planMode: true,
            planPhase: "planning" as PlanPhase,
          },
        },
      },
    ];
    const state = TaskState.fromSession(entries);
    expect(state.getPlanMode()).toBe(true);
    expect(state.getPlanPhase()).toBe("planning");
  });

  it("fromSession defaults planMode/planPhase when missing in details", () => {
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
    expect(state.getPlanMode()).toBe(false);
    expect(state.getPlanPhase()).toBe("idle");
  });

  it("isValidDetails rejects invalid planMode", () => {
    // We'll test via fromSession which internally uses isValidDetails
    const entries: SessionEntry[] = [
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: "todo",
          details: {
            tasks: [{ id: 1, subject: "A", status: "pending" }],
            nextId: 2,
            planMode: "yes" as unknown as boolean,
            planPhase: "planning",
          },
        },
      },
    ];
    const state = TaskState.fromSession(entries);
    // Should fall back to defaults since planMode is not boolean
    expect(state.getPlanMode()).toBe(false);
    expect(state.getPlanPhase()).toBe("idle");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pi-extensions/my-todo && npx vitest run state.test.ts`
Expected: FAIL - getPlanMode, setPlanMode, getPlanPhase, setPlanPhase not defined

- [ ] **Step 3: Add fields and methods to TaskState**

In `pi-extensions/my-todo/state.ts`:

Add two private fields after `private nextId = 1;`:

```ts
  private planMode = false;
  private planPhase: PlanPhase = "idle";
```

Add the import for `PlanPhase` at the top:

```ts
import type { Task, TaskStatus, SessionEntry, PlanPhase } from "./types";
```

Add public methods after `getNextId()`:

```ts
  getPlanMode(): boolean {
    return this.planMode;
  }

  getPlanPhase(): PlanPhase {
    return this.planPhase;
  }

  setPlanMode(mode: boolean, phase: PlanPhase): void {
    this.planMode = mode;
    this.planPhase = phase;
  }
```

- [ ] **Step 4: Update snapshot() to include planMode/planPhase**

Change the `snapshot()` method return and body:

```ts
  snapshot(): { tasks: Task[]; nextId: number; planMode: boolean; planPhase: PlanPhase } {
    return {
      tasks: deepCopyTasks(this.tasks),
      nextId: this.nextId,
      planMode: this.planMode,
      planPhase: this.planPhase,
    };
  }
```

- [ ] **Step 5: Update isValidDetails to validate new fields**

Change `isValidDetails` to add boolean/string checks for planMode/planPhase. Replace the existing function:

```ts
function isValidDetails(value: unknown): value is {
  tasks: Task[];
  nextId: number;
  planMode?: boolean;
  planPhase?: string;
} {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.tasks)) return false;
  if (typeof obj.nextId !== "number") return false;
  // planMode/planPhase are optional for backward compat
  if (obj.planMode !== undefined && typeof obj.planMode !== "boolean") return false;
  if (obj.planPhase !== undefined && typeof obj.planPhase !== "string") return false;
  return obj.tasks.every(
    (t) =>
      typeof t === "object" &&
      t !== null &&
      typeof (t as Record<string, unknown>).id === "number" &&
      typeof (t as Record<string, unknown>).subject === "string" &&
      typeof (t as Record<string, unknown>).status === "string"
  );
}
```

- [ ] **Step 6: Update fromSession to restore planMode/planPhase**

Inside `fromSession`, after restoring tasks/nextId, add:

```ts
      if (typeof entry.message.details.planMode === "boolean") {
        state.planMode = entry.message.details.planMode;
      }
      if (typeof entry.message.details.planPhase === "string") {
        state.planPhase = entry.message.details.planPhase as PlanPhase;
      }
```

Insert these lines right after `state.nextId = entry.message.details.nextId;` and before `break;`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd pi-extensions/my-todo && npx vitest run state.test.ts`
Expected: PASS - all tests pass (no coverage check yet, will check overall later)

- [ ] **Step 8: Commit**

```bash
git add pi-extensions/my-todo/state.ts pi-extensions/my-todo/state.test.ts
git commit -m "feat(my-todo): add planMode/planPhase to TaskState with persistence"
```

---

### Task 3: Add plan-mode-aware widget rendering in overlay.ts

**Files:**
- Modify: `pi-extensions/my-todo/overlay.ts`

- [ ] **Step 1: Write the failing tests**

In `pi-extensions/my-todo/overlay.test.ts`, add these imports and tests:

```ts
import { renderPlanOverlay } from "./overlay";

describe("renderPlanOverlay", () => {
  it("returns empty array for no tasks", () => {
    expect(renderPlanOverlay([])).toEqual([]);
  });

  it("returns empty array for only deleted tasks", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "deleted" }];
    expect(renderPlanOverlay(tasks)).toEqual([]);
  });

  it("renders title 'Plan (N)' for planning phase", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "pending" },
      { id: 2, subject: "B", status: "pending" },
    ];
    const result = renderPlanOverlay(tasks, "planning");
    expect(result[0]).toBe("Plan (2)");
    expect(result).toEqual([
      "Plan (2)",
      "○ #1 A",
      "○ #2 B",
    ]);
  });

  it("renders title 'Executing (N)' for executing phase", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "in_progress" },
    ];
    const result = renderPlanOverlay(tasks, "executing");
    expect(result[0]).toBe("Executing (1)");
    expect(result).toEqual([
      "Executing (1)",
      "● #1 A",
    ]);
  });

  it("sorts in_progress before pending", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "pending" },
      { id: 2, subject: "B", status: "in_progress" },
    ];
    const result = renderPlanOverlay(tasks, "executing");
    expect(result).toEqual([
      "Executing (2)",
      "● #2 B",
      "○ #1 A",
    ]);
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
    expect(result).toEqual([
      "Plan (1)",
      "○ #1 A",
    ]);
  });
});

describe("renderPlanOverlay with theme", () => {
  it("styles title with accent and bold", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "pending" }];
    renderPlanOverlay(tasks, "planning", mockTheme);
    expect(mockTheme.bold).toHaveBeenCalledWith("Plan (1)");
    expect(mockTheme.fg).toHaveBeenCalledWith("accent", expect.stringContaining("Plan (1)"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pi-extensions/my-todo && npx vitest run overlay.test.ts`
Expected: FAIL - `renderPlanOverlay` not exported

- [ ] **Step 3: Implement renderPlanOverlay**

In `pi-extensions/my-todo/overlay.ts`, add the import for `PlanPhase`:

```ts
import type { Task, PlanPhase } from "./types";
```

Add the new function after `renderCompletedOverlay` and before the backward-compatible `renderOverlay`:

```ts
export function renderPlanOverlay(tasks: Task[], phase: PlanPhase, theme?: ThemeLike): string[] {
  const visible = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  if (visible.length === 0) return [];

  const sorted = sortByPriority(visible);
  const title = phase === "planning"
    ? `Plan (${sorted.length})`
    : `Executing (${sorted.length})`;
  return renderTaskList(
    sorted,
    title,
    "accent",
    (task) => STATUS_COLORS[task.status as "pending" | "in_progress"],
    theme
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pi-extensions/my-todo && npx vitest run overlay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-todo/overlay.ts pi-extensions/my-todo/overlay.test.ts
git commit -m "feat(my-todo): add renderPlanOverlay with phase-aware titles"
```

---

### Task 4: Wire up plan mode commands, events, shortcuts, and tool whitelist in index.ts

**Files:**
- Modify: `pi-extensions/my-todo/index.ts`
- Modify: `pi-extensions/my-todo/index.test.ts`

This is the largest task. We'll break it into sub-steps.

#### 4a: Write failing tests for plan mode features

- [ ] **Step 1: Write failing tests for plan commands and events**

In `pi-extensions/my-todo/index.test.ts`, add after the last test block:

```ts
  describe("plan mode", () => {
    it("registers Ctrl+Shift+P shortcut", async () => {
      await initExtension();
      expect(mockPi.registerShortcut).toHaveBeenCalledWith(
        "Ctrl+Shift+P",
        expect.any(Object)
      );
    });

    it("registers before_agent_start event", async () => {
      await initExtension();
      expect(registeredEvents.has("before_agent_start")).toBe(true);
    });

    it("registers tool_call event", async () => {
      await initExtension();
      expect(registeredEvents.has("tool_call")).toBe(true);
    });

    it("registers agent_end event", async () => {
      await initExtension();
      expect(registeredEvents.has("agent_end")).toBe(true);
    });

    it("registers turn_start and turn_end events", async () => {
      await initExtension();
      expect(registeredEvents.has("turn_start")).toBe(true);
      expect(registeredEvents.has("turn_end")).toBe(true);
    });

    it("/todos plan enters planning mode", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("plan", ctx);
      // Verify via todo tool state - create a task, check details
      const toolDef = registeredTools[0];
      const result = await toolDef.execute(
        "tc-1",
        { action: "create", subject: "Plan step 1" },
        undefined,
        undefined,
        ctx
      );
      expect(result.details.planMode).toBe(true);
      expect(result.details.planPhase).toBe("planning");
      // Widget should use plan overlay
      expect(ctx.ui.setWidget).toHaveBeenCalled();
    });

    it("/todos execute enters executing phase", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      // Enter planning first
      await cmd.handler("plan", ctx);
      // Create a task
      const toolDef = registeredTools[0];
      await toolDef.execute(
        "tc-1",
        { action: "create", subject: "Step 1" },
        undefined,
        undefined,
        ctx
      );
      // Execute
      await cmd.handler("execute", ctx);
      const result = await toolDef.execute(
        "tc-1",
        { action: "list" },
        undefined,
        undefined,
        ctx
      );
      expect(result.details.planMode).toBe(true);
      expect(result.details.planPhase).toBe("executing");
    });

    it("/todos reset clears tasks and exits plan mode", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      // Enter planning
      await cmd.handler("plan", ctx);
      const toolDef = registeredTools[0];
      await toolDef.execute(
        "tc-1",
        { action: "create", subject: "Step 1" },
        undefined,
        undefined,
        ctx
      );
      // Reset
      await cmd.handler("reset", ctx);
      const result = await toolDef.execute(
        "tc-1",
        { action: "list" },
        undefined,
        undefined,
        ctx
      );
      expect(result.details.tasks).toHaveLength(0);
      expect(result.details.planMode).toBe(false);
      expect(result.details.planPhase).toBe("idle");
    });

    it("Ctrl+Shift+P toggles plan mode", async () => {
      await initExtension();
      const shortcutHandler = mockPi.registerShortcut.mock.calls.find(
        ([key]: [string, any]) => key === "Ctrl+Shift+P"
      )[1].handler;
      const ctx = createMockCtx();
      await shortcutHandler(ctx);
      // Toggle on
      const toolDef = registeredTools[0];
      const result1 = await toolDef.execute(
        "tc-1",
        { action: "create", subject: "Step 1" },
        undefined,
        undefined,
        ctx
      );
      expect(result1.details.planMode).toBe(true);
      expect(result1.details.planPhase).toBe("planning");
      // Toggle off
      await shortcutHandler(ctx);
      const result2 = await toolDef.execute(
        "tc-1",
        { action: "list" },
        undefined,
        undefined,
        ctx
      );
      expect(result2.details.planMode).toBe(false);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pi-extensions/my-todo && npx vitest run index.test.ts`
Expected: FAIL - plan-related tests fail (no plan command handler yet)

#### 4b: Implement plan mode commands

- [ ] **Step 3: Update imports in index.ts**

Add `PlanPhase` to the import from `./types`:

```ts
import type { Task, TaskStatus, PlanPhase } from "./types";
```

Add `renderPlanOverlay` to the import from `./overlay`:

```ts
import { renderActiveOverlay, renderCompletedOverlay, renderPlanOverlay } from "./overlay";
```

- [ ] **Step 4: Update refreshOverlay to handle plan mode**

Replace the `refreshOverlay` function:

```ts
  function refreshOverlay(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;

    const tasks = state.list();
    const planMode = state.getPlanMode();
    const planPhase = state.getPlanPhase();

    if (planMode) {
      // In plan mode, use a single plan overlay widget
      const active = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
      if (active.length === 0) {
        ctx.ui.setWidget("my-todo", undefined);
      } else {
        ctx.ui.setWidget("my-todo", (_tui, theme) => ({
          render: () => renderPlanOverlay(active, planPhase, theme),
          invalidate: () => {},
        }));
      }
      ctx.ui.setWidget("my-todo-completed", undefined);
      return;
    }

    const active = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
    const completed = tasks.filter((t) => t.status === "completed");

    if (active.length === 0) {
      ctx.ui.setWidget("my-todo", undefined);
    } else {
      ctx.ui.setWidget("my-todo", (_tui, theme) => ({
        render: () => renderActiveOverlay(active, theme),
        invalidate: () => {},
      }));
    }

    if (completed.length === 0) {
      ctx.ui.setWidget("my-todo-completed", undefined);
    } else {
      ctx.ui.setWidget("my-todo-completed", (_tui, theme) => ({
        render: () => renderCompletedOverlay(completed, theme),
        invalidate: () => {},
      }));
    }
  }
```

- [ ] **Step 5: Add plan/execute/reset to the /todos command**

In `pi.registerCommand("todos", ...)`, update the `getArgumentCompletions` to add plan/execute/reset subcommands. In the subcommand suggestions array, add after `{ value: "add", ... }`:

```ts
          { value: "plan", label: "plan", description: "Enter plan mode" },
          { value: "execute", label: "execute", description: "Start executing the plan" },
          { value: "reset", label: "reset", description: "Clear all tasks and exit plan mode" },
```

In the `handler` function, add cases for the new subcommands. After the `if (sub === "add") { ... }` block and before the `const validMutations` line, add:

```ts
      if (sub === "plan") {
        if (state.getPlanMode() && state.getPlanPhase() === "planning") {
          ctx.ui.notify("Already in plan mode.", "info");
          return;
        }
        const tasks = state.list();
        if (tasks.length > 0) {
          // Note: in a real interactive flow, we'd use ctx.ui.confirm.
          // For notifications-only, we proceed directly.
        }
        state.setPlanMode(true, "planning");
        refreshOverlay(ctx);
        ctx.ui.notify("Plan mode enabled. Only read-only tools are available.", "info");
        return;
      }

      if (sub === "execute") {
        if (!state.getPlanMode()) {
          ctx.ui.notify("Not in plan mode.", "warning");
          return;
        }
        state.setPlanMode(true, "executing");
        refreshOverlay(ctx);
        ctx.ui.notify("Executing plan. All tools are available.", "info");
        return;
      }

      if (sub === "reset") {
        state.clear();
        state.setPlanMode(false, "idle");
        refreshOverlay(ctx);
        ctx.ui.notify("Plan reset. All tasks cleared.", "info");
        return;
      }
```

- [ ] **Step 6: Update todo tool details return to include planMode/planPhase**

In every `return` within the `execute` method that returns a `details` object, add `planMode` and `planPhase`:

```ts
details: { action: params.action, params, tasks: state.list(), nextId: state.getNextId(), planMode: state.getPlanMode(), planPhase: state.getPlanPhase() },
```

This applies to all 8 return points (create, update, list, get, delete, clear, error, and default which is unreachable). Make sure every details object has these two extra fields.

- [ ] **Step 8: Run tests to verify commands pass**

Run: `cd pi-extensions/my-todo && npx vitest run index.test.ts`
Expected: Plan command tests should start passing (the ones about /todos plan, execute, reset, Ctrl+Shift+P)

#### 4c: Implement tool whitelist via tool_call event

- [ ] **Step 9: Write failing tests for tool_call whitelist**

In `pi-extensions/my-todo/index.test.ts`, add after the `plan mode` describe block:

```ts
  describe("plan mode tool whitelist", () => {
    async function enterPlanMode() {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("plan", ctx);
      return registeredEvents.get("tool_call")!;
    }

    it("blocks edit tool in planning mode", async () => {
      const handler = await enterPlanMode();
      const ctx = createMockCtx();
      const event = {
        type: "tool_call" as const,
        toolCallId: "tc-1",
        toolName: "edit",
        input: {} as any,
      };
      const result = await handler(event, ctx);
      expect(result).toEqual({ block: true, reason: "Plan mode: only read-only tools are allowed" });
    });

    it("blocks write tool in planning mode", async () => {
      const handler = await enterPlanMode();
      const ctx = createMockCtx();
      const event = {
        type: "tool_call" as const,
        toolCallId: "tc-1",
        toolName: "write",
        input: {} as any,
      };
      const result = await handler(event, ctx);
      expect(result).toEqual({ block: true, reason: "Plan mode: only read-only tools are allowed" });
    });

    it("blocks grep tool in planning mode", async () => {
      const handler = await enterPlanMode();
      const ctx = createMockCtx();
      const event = {
        type: "tool_call" as const,
        toolCallId: "tc-1",
        toolName: "grep",
        input: {} as any,
      };
      const result = await handler(event, ctx);
      expect(result).toEqual({ block: true, reason: "Plan mode: only read-only tools are allowed" });
    });

    it("blocks find tool in planning mode", async () => {
      const handler = await enterPlanMode();
      const ctx = createMockCtx();
      const event = {
        type: "tool_call" as const,
        toolCallId: "tc-1",
        toolName: "find",
        input: {} as any,
      };
      const result = await handler(event, ctx);
      expect(result).toEqual({ block: true, reason: "Plan mode: only read-only tools are allowed" });
    });

    it("blocks ls tool in planning mode", async () => {
      const handler = await enterPlanMode();
      const ctx = createMockCtx();
      const event = {
        type: "tool_call" as const,
        toolCallId: "tc-1",
        toolName: "ls",
        input: {} as any,
      };
      const result = await handler(event, ctx);
      expect(result).toEqual({ block: true, reason: "Plan mode: only read-only tools are allowed" });
    });

    it("allows read tool in planning mode", async () => {
      const handler = await enterPlanMode();
      const ctx = createMockCtx();
      const event = {
        type: "tool_call" as const,
        toolCallId: "tc-1",
        toolName: "read",
        input: {} as any,
      };
      const result = await handler(event, ctx);
      expect(result).toBeUndefined();
    });

    it("allows bash tool in planning mode", async () => {
      const handler = await enterPlanMode();
      const ctx = createMockCtx();
      const event = {
        type: "tool_call" as const,
        toolCallId: "tc-1",
        toolName: "bash",
        input: {} as any,
      };
      const result = await handler(event, ctx);
      expect(result).toBeUndefined();
    });

    it("allows web_search tool in planning mode", async () => {
      const handler = await enterPlanMode();
      const ctx = createMockCtx();
      const event = {
        type: "tool_call" as const,
        toolCallId: "tc-1",
        toolName: "web_search",
        input: {} as any,
      };
      const result = await handler(event, ctx);
      expect(result).toBeUndefined();
    });

    it("allows web_fetch tool in planning mode", async () => {
      const handler = await enterPlanMode();
      const ctx = createMockCtx();
      const event = {
        type: "tool_call" as const,
        toolCallId: "tc-1",
        toolName: "web_fetch",
        input: {} as any,
      };
      const result = await handler(event, ctx);
      expect(result).toBeUndefined();
    });

    it("allows ask_user_question tool in planning mode", async () => {
      const handler = await enterPlanMode();
      const ctx = createMockCtx();
      const event = {
        type: "tool_call" as const,
        toolCallId: "tc-1",
        toolName: "ask_user_question",
        input: {} as any,
      };
      const result = await handler(event, ctx);
      expect(result).toBeUndefined();
    });

    it("allows todo tool in planning mode", async () => {
      const handler = await enterPlanMode();
      const ctx = createMockCtx();
      const event = {
        type: "tool_call" as const,
        toolCallId: "tc-1",
        toolName: "todo",
        input: {} as any,
      };
      const result = await handler(event, ctx);
      expect(result).toBeUndefined();
    });

    it("allows all tools in executing mode", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("plan", ctx);
      await cmd.handler("execute", ctx);
      const handler = registeredEvents.get("tool_call")!;
      const event = {
        type: "tool_call" as const,
        toolCallId: "tc-1",
        toolName: "edit",
        input: {} as any,
      };
      const result = await handler(event, ctx);
      expect(result).toBeUndefined();
    });

    it("allows all tools when not in plan mode", async () => {
      await initExtension();
      const handler = registeredEvents.get("tool_call")!;
      const ctx = createMockCtx();
      const event = {
        type: "tool_call" as const,
        toolCallId: "tc-1",
        toolName: "edit",
        input: {} as any,
      };
      const result = await handler(event, ctx);
      expect(result).toBeUndefined();
    });
  });
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `cd pi-extensions/my-todo && npx vitest run index.test.ts`
Expected: FAIL - tool_call not registered or allowed tools blocked

- [ ] **Step 11: Register tool_call event handler**

In `index.ts`, add after the `turn_end` handler:

```ts
  // Read-only tools allowed in planning mode
  const READ_ONLY_TOOLS = new Set([
    "read",
    "bash",
    "grep",
    "find",
    "ls",
    "ask_user_question",
    "web_search",
    "web_fetch",
    "todo",
  ]);

  pi.on("tool_call", async (event, _ctx) => {
    if (!state.getPlanMode() || state.getPlanPhase() !== "planning") {
      return;
    }
    if (!READ_ONLY_TOOLS.has(event.toolName)) {
      return {
        block: true,
        reason: "Plan mode: only read-only tools are allowed",
      };
    }
  });
```

- [ ] **Step 12: Run tests to verify tool whitelist tests pass**

Run: `cd pi-extensions/my-todo && npx vitest run index.test.ts`
Expected: All tool whitelist tests pass

#### 4d: Implement before_agent_start system prompt injection

- [ ] **Step 13: Write failing tests for before_agent_start**

In `pi-extensions/my-todo/index.test.ts`, add:

```ts
  describe("before_agent_start", () => {
    it("injects planning system prompt in planning phase", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("plan", ctx);

      const handler = registeredEvents.get("before_agent_start")!;
      const result = await handler({}, ctx);
      expect(result).toBeDefined();
      expect(result.message).toBeDefined();
      expect(result.message.display).toBe(false);
      expect(result.message.content).toContain("plan mode");
      expect(result.message.content).toContain("read-only");
    });

    it("injects executing system prompt in executing phase", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("plan", ctx);
      await cmd.handler("execute", ctx);

      const handler = registeredEvents.get("before_agent_start")!;
      const result = await handler({}, ctx);
      expect(result).toBeDefined();
      expect(result.message).toBeDefined();
      expect(result.message.display).toBe(false);
      expect(result.message.content).toContain("executing");
      expect(result.message.content).toContain("todo");
    });

    it("does not inject when not in plan mode", async () => {
      await initExtension();
      const handler = registeredEvents.get("before_agent_start")!;
      const ctx = createMockCtx();
      const result = await handler({}, ctx);
      expect(result).toBeUndefined();
    });
  });
```

- [ ] **Step 14: Run tests to verify they fail**

Run: `cd pi-extensions/my-todo && npx vitest run index.test.ts`
Expected: FAIL - before_agent_start not registered or returns nothing

- [ ] **Step 15: Register before_agent_start event handler**

In `index.ts`, add after the `tool_call` handler:

```ts
  pi.on("before_agent_start", async (_event, _ctx) => {
    if (!state.getPlanMode()) return;

    if (state.getPlanPhase() === "planning") {
      return {
        message: {
          customType: "hidden",
          content: "You are in plan mode. You can only use read-only tools (read, bash, grep, find, ls, ask_user_question, web_search, web_fetch). Use the todo tool to create a task list for the plan. Do not modify any files. Do not use edit, write, or any other modifying tools. Ask the user questions with ask_user_question if you need clarification.",
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
  });
```

- [ ] **Step 16: Run tests to verify they pass**

Run: `cd pi-extensions/my-todo && npx vitest run index.test.ts`
Expected: All before_agent_start tests pass

#### 4e: Implement agent_end dialog

- [ ] **Step 17: Write failing tests for agent_end dialog**

In `pi-extensions/my-todo/index.test.ts`, add:

```ts
  describe("agent_end dialog", () => {
    it("shows select dialog in planning mode with tasks", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      // Set up state in planning mode with tasks
      await cmd.handler("plan", ctx);
      const toolDef = registeredTools[0];
      await toolDef.execute(
        "tc-1",
        { action: "create", subject: "Step 1" },
        undefined,
        undefined,
        ctx
      );

      ctx.ui.select = vi.fn().mockResolvedValue("Execute plan");

      const handler = registeredEvents.get("agent_end")!;
      await handler({}, ctx);

      expect(ctx.ui.select).toHaveBeenCalledWith(
        "Plan Complete",
        expect.arrayContaining(["Execute plan", "Continue planning", "Discard plan"]),
        expect.any(Object)
      );
    });

    it("does not show dialog when not in plan mode", async () => {
      await initExtension();
      const handler = registeredEvents.get("agent_end")!;
      const ctx = createMockCtx();
      ctx.ui.select = vi.fn();
      await handler({}, ctx);
      expect(ctx.ui.select).not.toHaveBeenCalled();
    });

    it("does not show dialog when in executing phase", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("plan", ctx);
      await cmd.handler("execute", ctx);
      ctx.ui.select = vi.fn();

      const handler = registeredEvents.get("agent_end")!;
      await handler({}, ctx);
      expect(ctx.ui.select).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 18: Run tests to verify they fail**

Run: `cd pi-extensions/my-todo && npx vitest run index.test.ts`
Expected: FAIL - agent_end not registered or doesn't show dialog

- [ ] **Step 19: Register agent_end event handler**

In `index.ts`, add after the `before_agent_start` handler:

```ts
  pi.on("agent_end", async (_event, ctx) => {
    if (!state.getPlanMode() || state.getPlanPhase() !== "planning") return;
    if (!ctx.hasUI) return;

    const tasks = state.list();
    if (tasks.length === 0) return;

    const choice = await ctx.ui.select(
      "Plan Complete",
      ["Execute plan", "Continue planning", "Discard plan"],
    );

    if (choice === "Execute plan") {
      state.setPlanMode(true, "executing");
      refreshOverlay(ctx);
    } else if (choice === "Discard plan") {
      state.clear();
      state.setPlanMode(false, "idle");
      refreshOverlay(ctx);
    }
    // choice === "Continue planning" or undefined → keep planning
  });
```

- [ ] **Step 20: Run tests to verify they pass**

Run: `cd pi-extensions/my-todo && npx vitest run index.test.ts`
Expected: All agent_end tests pass

#### 4f: Implement Ctrl+Shift+P shortcut

- [ ] **Step 21: Register Ctrl+Shift+P shortcut**

In `index.ts`, add after `pi.registerCommand("todos", ...)` closing:

```ts
  pi.registerShortcut("Ctrl+Shift+P", {
    description: "Toggle plan mode",
    handler: async (ctx) => {
      if (state.getPlanMode()) {
        state.clear();
        state.setPlanMode(false, "idle");
        refreshOverlay(ctx);
        ctx.ui.notify("Plan mode disabled.", "info");
      } else {
        state.setPlanMode(true, "planning");
        refreshOverlay(ctx);
        ctx.ui.notify("Plan mode enabled. Only read-only tools are available.", "info");
      }
    },
  });
```

- [ ] **Step 22: Run tests to verify all pass**

Run: `cd pi-extensions/my-todo && npx vitest run index.test.ts`
Expected: ALL tests pass (existing + new)

- [ ] **Step 23: Commit**

```bash
git add pi-extensions/my-todo/index.ts pi-extensions/my-todo/index.test.ts
git commit -m "feat(my-todo): add plan mode with commands, tool whitelist, system prompt injection, and agent_end dialog"
```

---

### Task 5: Update existing tests for details shape change

**Files:**
- Modify: `pi-extensions/my-todo/index.test.ts` (existing tests that check `result.details`)

- [ ] **Step 1: Identify existing tests that need updating**

The todo tool's `details` shape now includes `planMode` and `planPhase` in every return. The existing test `it("todo tool error returns task state")` checks `result.details.tasks` and `result.details.nextId` - that still works. The tests that do `expect(result.details.tasks).toHaveLength(N)` still work.

However, any test that does `expect(result.details).toEqual(...)` would fail because of the new fields. Let's check...

Looking at the existing tests, none of them use `toEqual` on the full details object. They use `.toHaveLength`, `.toBe`, or access properties directly. So no existing tests should break from the shape change.

- [ ] **Step 2: Run full test suite**

Run: `cd pi-extensions/my-todo && npx vitest run`
Expected: All tests pass. If any existing test fails due to details shape, fix it.

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-todo/index.test.ts  # only if fixes were needed
git commit -m "test(my-todo): ensure existing tests pass with plan mode additions"
```

---

### Task 6: Run full test suite with coverage

**Files:** None (verification only)

- [ ] **Step 1: Run full coverage**

Run: `cd pi-extensions/my-todo && npx vitest run --coverage`
Expected: 100% coverage on branches, functions, lines, statements (excluding index.ts, RealGitAdapter)

- [ ] **Step 2: Fix any coverage gaps**

If coverage is below 100%, add missing tests and re-verify.

- [ ] **Step 3: Final commit if needed**

```bash
git add pi-extensions/my-todo/
git commit -m "test(my-todo): ensure 100% coverage for plan mode"
```

---

## Self-Review

**1. Spec coverage:**

| Design Requirement | Task |
|---|---|
| PlanPhase type in types.ts | Task 1 |
| TaskState planMode/planPhase fields | Task 2 |
| snapshot/fromSession persistence | Task 2 |
| isValidDetails backward compat | Task 2 |
| Widget titles: "Plan (N)" / "Executing (N)" | Task 3 |
| /todos plan command | Task 4 (4b) |
| /todos execute command | Task 4 (4b) |
| /todos reset command | Task 4 (4b) |
| Ctrl+Shift+P shortcut | Task 4 (4f) |
| before_agent_start system prompt | Task 4 (4d) |
| tool_call whitelist (read, bash, grep, find, ls, ask_user_question, web_search, web_fetch) | Task 4 (4c) |
| agent_end dialog (Execute/Continue/Discard) | Task 4 (4e) |
| todo tool details includes planMode/planPhase | Task 4 (4b step 6) |
| session_start state restore | Already covered by existing code + Task 2 fromSession update |
| Auto-exit plan mode when all tasks completed | **Not implemented** — design says "当所有任务都 completed 时，widget 显示完成摘要，并自动退出规划模式". This requires post-turn check. Added as follow-up note. |
| Bash command whitelist (not implementing) | Confirmed not needed per design |

**2. Placeholder scan:** No TBDs, TODOs, or vague instructions. Every step has concrete code.

**3. Type consistency:**
- `PlanPhase` defined in Task 1, imported everywhere (state.ts, overlay.ts, index.ts)
- `renderPlanOverlay(phase: PlanPhase)` function signature consistent with callers
- `setPlanMode(mode: boolean, phase: PlanPhase)` used in index.ts
- `planMode: boolean, planPhase: PlanPhase` in details object same across all returns

**4. One gap identified:** The design specifies "当所有任务都 completed 时，widget 显示完成摘要，并自动退出规划模式". This auto-completion detection is not explicitly handled. It should be checked in `turn_end` or `agent_end`. Will add a follow-up task for this.

---

**Plan complete and saved to `.lychee/artifacts/plans/2026-06-12-my-plan-mode.md`. Two execution options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - I execute tasks in this session using `executing-plans`, batch execution with checkpoints

**Which approach?**
