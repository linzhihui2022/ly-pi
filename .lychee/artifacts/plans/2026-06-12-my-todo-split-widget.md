# my-todo Split Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single `my-todo` widget into two independent widgets (Active and Completed), each with its own title, ordering, display limit, and hide-when-empty behavior.

**Architecture:** Keep rendering logic inside `overlay.ts` and expose two entry points (`renderActiveOverlay` and `renderCompletedOverlay`). Update `index.ts` to refresh both widget IDs independently. Maintain existing state, tool, and command behavior; only widget registration and rendering change.

**Tech Stack:** TypeScript, Vitest, `@earendil-works/pi-coding-agent` extension API, Bun workspace under `pi-extensions/my-todo`.

---

## Files

| File | Responsibility |
|------|----------------|
| `pi-extensions/my-todo/overlay.ts` | Render task lists into widget lines. After this change it exports two public renderers: `renderActiveOverlay` and `renderCompletedOverlay`. |
| `pi-extensions/my-todo/overlay.test.ts` | Unit tests for both renderers: filtering, sorting, limits, titles, colors, empty states. |
| `pi-extensions/my-todo/index.ts` | Extension entry point. Refreshes both `my-todo` and `my-todo-completed` widgets based on current task state. |
| `pi-extensions/my-todo/index.test.ts` | Integration tests for widget registration: both widgets render when they have tasks, hide when empty, and refresh on lifecycle events. |

---

## Task 1: Refactor `overlay.ts` for split renderers

**Files:**
- Modify: `pi-extensions/my-todo/overlay.ts`
- Test: `pi-extensions/my-todo/overlay.test.ts`

Goal: Replace the single `renderOverlay` with two public functions while keeping shared helpers internal.

- [ ] **Step 1: Write the failing test for `renderActiveOverlay`**

Add to `overlay.test.ts` (keep existing `renderOverlay` tests for now; they will be removed after the refactor):

```ts
import { renderActiveOverlay, renderCompletedOverlay } from "./overlay";

// Add a new top-level describe after the existing one:
describe("renderActiveOverlay", () => {
  it("returns empty array when no tasks", () => {
    expect(renderActiveOverlay([])).toEqual([]);
  });

  it("returns empty array for only completed tasks", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "completed" }];
    expect(renderActiveOverlay(tasks)).toEqual([]);
  });

  it("returns empty array for only deleted tasks", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "deleted" }];
    expect(renderActiveOverlay(tasks)).toEqual([]);
  });

  it("renders pending task", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "pending" }];
    expect(renderActiveOverlay(tasks)).toEqual(["Active (1)", "○ #1 A"]);
  });

  it("renders in_progress task", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "in_progress" }];
    expect(renderActiveOverlay(tasks)).toEqual(["Active (1)", "● #1 A"]);
  });

  it("sorts in_progress before pending", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "pending" },
      { id: 2, subject: "B", status: "in_progress" },
    ];
    expect(renderActiveOverlay(tasks)).toEqual([
      "Active (2)",
      "● #2 B",
      "○ #1 A",
    ]);
  });

  it("caps at 3 tasks and shows overflow", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "pending" },
      { id: 2, subject: "B", status: "pending" },
      { id: 3, subject: "C", status: "pending" },
      { id: 4, subject: "D", status: "pending" },
    ];
    expect(renderActiveOverlay(tasks)).toEqual([
      "Active (4)",
      "○ #1 A",
      "○ #2 B",
      "○ #3 C",
      "  +1 more",
    ]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:
```bash
cd pi-extensions/my-todo && bunx vitest run overlay.test.ts
```

Expected: FAIL — `renderActiveOverlay` is not exported.

- [ ] **Step 3: Refactor `overlay.ts` to add `renderActiveOverlay`**

Modify `pi-extensions/my-todo/overlay.ts`:

1. Change `MAX_VISIBLE = 5` to `MAX_VISIBLE = 3`.
2. Keep `sortByPriority` and helpers, but rename `renderOverlay` to `renderActiveOverlay` and adjust its filter/title.

```ts
import type { Task } from "./types";

interface ThemeLike {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

const STATUS_SYMBOLS: Record<Task["status"], string> = {
  pending: "○",
  in_progress: "●",
  completed: "✓",
  deleted: "🗑",
};

const STATUS_COLORS: Record<Exclude<Task["status"], "deleted">, string> = {
  pending: "dim",
  in_progress: "accent",
  completed: "muted",
};

const MAX_VISIBLE = 3;

function sortByPriority(tasks: Task[]): Task[] {
  const priority: Record<Task["status"], number> = {
    in_progress: 0,
    pending: 1,
    completed: 2,
    deleted: 3,
  };
  return [...tasks].sort((a, b) => priority[a.status] - priority[b.status]);
}

function renderTaskLine(task: Task, theme?: ThemeLike): string {
  const symbol = STATUS_SYMBOLS[task.status];
  const line = `${symbol} #${task.id} ${task.subject}`;
  if (!theme) return line;
  const color = STATUS_COLORS[task.status as Exclude<Task["status"], "deleted">];
  return theme.fg(color, line);
}

function renderTaskList(
  tasks: Task[],
  title: string,
  titleColor: string,
  lineColor: ((task: Task) => string) | undefined,
  theme?: ThemeLike
): string[] {
  if (tasks.length === 0) return [];

  const display = tasks.slice(0, MAX_VISIBLE);
  const overflow = tasks.length - MAX_VISIBLE;

  const lines: string[] = [];
  lines.push(theme ? theme.fg(titleColor, theme.bold(title)) : title);

  for (const task of display) {
    if (theme && lineColor) {
      lines.push(theme.fg(lineColor(task), `${STATUS_SYMBOLS[task.status]} #${task.id} ${task.subject}`));
    } else {
      lines.push(`${STATUS_SYMBOLS[task.status]} #${task.id} ${task.subject}`);
    }
  }

  if (overflow > 0) {
    const more = `  +${overflow} more`;
    lines.push(theme ? theme.fg("dim", more) : more);
  }

  return lines;
}

export function renderActiveOverlay(tasks: Task[], theme?: ThemeLike): string[] {
  const visible = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  if (visible.length === 0) return [];

  const sorted = sortByPriority(visible);
  const title = `Active (${sorted.length})`;
  return renderTaskList(
    sorted,
    title,
    "accent",
    (task) => STATUS_COLORS[task.status as "pending" | "in_progress"],
    theme
  );
}

export function renderCompletedOverlay(tasks: Task[], theme?: ThemeLike): string[] {
  const visible = tasks.filter((t) => t.status === "completed");
  if (visible.length === 0) return [];

  const sorted = [...visible].sort((a, b) => b.id - a.id);
  const title = `Completed (${sorted.length})`;
  return renderTaskList(sorted, title, "muted", () => "muted", theme);
}

// Backward-compatible alias until index.ts is updated:
export function renderOverlay(tasks: Task[], theme?: ThemeLike): string[] {
  return renderActiveOverlay(tasks, theme);
}
```

- [ ] **Step 4: Run tests for `renderActiveOverlay`**

Run:
```bash
cd pi-extensions/my-todo && bunx vitest run overlay.test.ts
```

Expected: New `renderActiveOverlay` tests pass; existing `renderOverlay` tests may still pass because it is now an alias.

- [ ] **Step 5: Write failing tests for `renderCompletedOverlay`**

Add to `overlay.test.ts`:

```ts
describe("renderCompletedOverlay", () => {
  it("returns empty array when no tasks", () => {
    expect(renderCompletedOverlay([])).toEqual([]);
  });

  it("returns empty array for active tasks", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "pending" },
      { id: 2, subject: "B", status: "in_progress" },
    ];
    expect(renderCompletedOverlay(tasks)).toEqual([]);
  });

  it("returns empty array for deleted tasks", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "deleted" }];
    expect(renderCompletedOverlay(tasks)).toEqual([]);
  });

  it("renders completed task", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "completed" }];
    expect(renderCompletedOverlay(tasks)).toEqual(["Completed (1)", "✓ #1 A"]);
  });

  it("sorts by id descending", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "completed" },
      { id: 3, subject: "C", status: "completed" },
      { id: 2, subject: "B", status: "completed" },
    ];
    expect(renderCompletedOverlay(tasks)).toEqual([
      "Completed (3)",
      "✓ #3 C",
      "✓ #2 B",
      "✓ #1 A",
    ]);
  });

  it("caps at 3 tasks and shows overflow", () => {
    const tasks: Task[] = [
      { id: 1, subject: "A", status: "completed" },
      { id: 2, subject: "B", status: "completed" },
      { id: 3, subject: "C", status: "completed" },
      { id: 4, subject: "D", status: "completed" },
    ];
    expect(renderCompletedOverlay(tasks)).toEqual([
      "Completed (4)",
      "✓ #4 D",
      "✓ #3 C",
      "✓ #2 B",
      "  +1 more",
    ]);
  });
});
```

- [ ] **Step 6: Run tests and confirm `renderCompletedOverlay` fails**

Run:
```bash
cd pi-extensions/my-todo && bunx vitest run overlay.test.ts
```

Expected: FAIL — `renderCompletedOverlay` not exported or not implemented.

- [ ] **Step 7: Implement `renderCompletedOverlay`**

Already added in Step 3. If not, add it now as shown in Step 3.

- [ ] **Step 8: Run all overlay tests**

Run:
```bash
cd pi-extensions/my-todo && bunx vitest run overlay.test.ts
```

Expected: PASS for both `renderActiveOverlay` and `renderCompletedOverlay`.

- [ ] **Step 9: Add theme tests for both new renderers**

Add to `overlay.test.ts`:

```ts
describe("renderActiveOverlay with theme", () => {
  it("styles title with accent and bold", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "pending" }];
    renderActiveOverlay(tasks, mockTheme);
    expect(mockTheme.bold).toHaveBeenCalledWith("Active (1)");
    expect(mockTheme.fg).toHaveBeenCalledWith("accent", expect.stringContaining("Active (1)"));
  });

  it("styles pending task in dim", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "pending" }];
    renderActiveOverlay(tasks, mockTheme);
    expect(mockTheme.fg).toHaveBeenCalledWith("dim", "○ #1 A");
  });

  it("styles in_progress task in accent", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "in_progress" }];
    renderActiveOverlay(tasks, mockTheme);
    expect(mockTheme.fg).toHaveBeenCalledWith("accent", "● #1 A");
  });

  it("styles overflow in dim", () => {
    const tasks: Task[] = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      subject: `Task ${i + 1}`,
      status: "pending" as const,
    }));
    renderActiveOverlay(tasks, mockTheme);
    expect(mockTheme.fg).toHaveBeenCalledWith("dim", "  +1 more");
  });
});

describe("renderCompletedOverlay with theme", () => {
  it("styles title with muted and bold", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "completed" }];
    renderCompletedOverlay(tasks, mockTheme);
    expect(mockTheme.bold).toHaveBeenCalledWith("Completed (1)");
    expect(mockTheme.fg).toHaveBeenCalledWith("muted", expect.stringContaining("Completed (1)"));
  });

  it("styles completed task in muted", () => {
    const tasks: Task[] = [{ id: 1, subject: "A", status: "completed" }];
    renderCompletedOverlay(tasks, mockTheme);
    expect(mockTheme.fg).toHaveBeenCalledWith("muted", "✓ #1 A");
  });

  it("styles overflow in dim", () => {
    const tasks: Task[] = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      subject: `Task ${i + 1}`,
      status: "completed" as const,
    }));
    renderCompletedOverlay(tasks, mockTheme);
    expect(mockTheme.fg).toHaveBeenCalledWith("dim", "  +1 more");
  });
});
```

Run:
```bash
cd pi-extensions/my-todo && bunx vitest run overlay.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add pi-extensions/my-todo/overlay.ts pi-extensions/my-todo/overlay.test.ts
git commit -m "feat(my-todo): split overlay renderers into active and completed"
```

---

## Task 2: Update `index.ts` to refresh both widgets

**Files:**
- Modify: `pi-extensions/my-todo/index.ts`
- Test: `pi-extensions/my-todo/index.test.ts`

Goal: Replace single-widget refresh with dual-widget refresh.

- [ ] **Step 1: Update the import in `index.ts`**

Change:
```ts
import { renderOverlay } from "./overlay";
```
to:
```ts
import { renderActiveOverlay, renderCompletedOverlay } from "./overlay";
```

- [ ] **Step 2: Replace `refreshOverlay` in `index.ts`**

Replace the existing function with:

```ts
function refreshOverlay(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;

  const tasks = state.list();
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

- [ ] **Step 3: Update existing tests that assert single widget behavior**

In `index.test.ts`, update the `session_start` and lifecycle tests to expect both widget IDs.

Replace:
```ts
expect(ctx.ui.setWidget).toHaveBeenCalledWith(
  "my-todo",
  expect.any(Function)
);
```
with:
```ts
expect(ctx.ui.setWidget).toHaveBeenCalledWith(
  "my-todo",
  expect.any(Function)
);
expect(ctx.ui.setWidget).not.toHaveBeenCalledWith(
  "my-todo-completed",
  expect.any(Function)
);
```

And replace:
```ts
expect(ctx.ui.setWidget).toHaveBeenCalledWith("my-todo", undefined);
```
with:
```ts
expect(ctx.ui.setWidget).toHaveBeenCalledWith("my-todo", undefined);
expect(ctx.ui.setWidget).toHaveBeenCalledWith("my-todo-completed", undefined);
```

- [ ] **Step 4: Add integration tests for split widgets**

Add to `index.test.ts`:

```ts
it("session_start renders both widgets when active and completed tasks exist", async () => {
  await initExtension();

  const handler = registeredEvents.get("session_start")!;
  const ctx = createMockCtx([
    {
      type: "message",
      message: {
        role: "toolResult",
        toolName: "todo",
        details: {
          tasks: [
            { id: 1, subject: "Active task", status: "in_progress" },
            { id: 2, subject: "Done task", status: "completed" },
          ],
          nextId: 3,
        },
      },
    },
  ]);

  await handler({}, ctx);
  expect(ctx.ui.setWidget).toHaveBeenCalledWith(
    "my-todo",
    expect.any(Function)
  );
  expect(ctx.ui.setWidget).toHaveBeenCalledWith(
    "my-todo-completed",
    expect.any(Function)
  );
});

it("session_start hides completed widget when no completed tasks", async () => {
  await initExtension();

  const handler = registeredEvents.get("session_start")!;
  const ctx = createMockCtx([
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
  ]);

  await handler({}, ctx);
  expect(ctx.ui.setWidget).toHaveBeenCalledWith(
    "my-todo",
    expect.any(Function)
  );
  expect(ctx.ui.setWidget).toHaveBeenCalledWith(
    "my-todo-completed",
    undefined
  );
});

it("todo tool update hides active widget and shows completed when task marked done", async () => {
  await initExtension();

  const toolDef = registeredTools[0];
  const ctx = createMockCtx();
  await toolDef.execute("tc-1", { action: "create", subject: "A" }, undefined, undefined, ctx);
  vi.clearAllMocks();

  await toolDef.execute(
    "tc-1",
    { action: "update", id: 1, status: "completed" },
    undefined,
    undefined,
    ctx
  );

  expect(ctx.ui.setWidget).toHaveBeenCalledWith("my-todo", undefined);
  expect(ctx.ui.setWidget).toHaveBeenCalledWith(
    "my-todo-completed",
    expect.any(Function)
  );
});
```

- [ ] **Step 5: Run integration tests**

Run:
```bash
cd pi-extensions/my-todo && bunx vitest run index.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full test suite**

Run:
```bash
cd pi-extensions/my-todo && bunx vitest run
```

Expected: PASS with 100% coverage for `overlay.ts` and `index.ts`.

- [ ] **Step 7: Commit**

```bash
git add pi-extensions/my-todo/index.ts pi-extensions/my-todo/index.test.ts
git commit -m "feat(my-todo): refresh active and completed widgets independently"
```

---

## Task 3: Clean up legacy overlay alias

**Files:**
- Modify: `pi-extensions/my-todo/overlay.ts`
- Modify: `pi-extensions/my-todo/overlay.test.ts`

Goal: Remove the backward-compatible `renderOverlay` alias and its tests.

- [ ] **Step 1: Remove `renderOverlay` alias from `overlay.ts`**

Delete:
```ts
export function renderOverlay(tasks: Task[], theme?: ThemeLike): string[] {
  return renderActiveOverlay(tasks, theme);
}
```

- [ ] **Step 2: Remove legacy `renderOverlay` tests from `overlay.test.ts`**

Delete the entire top-level `describe("renderOverlay", () => { ... });` block.

- [ ] **Step 3: Run overlay tests**

Run:
```bash
cd pi-extensions/my-todo && bunx vitest run overlay.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-todo/overlay.ts pi-extensions/my-todo/overlay.test.ts
git commit -m "refactor(my-todo): remove legacy renderOverlay alias"
```

---

## Verification

- [ ] Run the full workspace test suite:

```bash
cd /Users/lychee/Documents/configure && bunx turbo run test
```

Expected: All tests pass.

- [ ] Run the full build:

```bash
cd /Users/lychee/Documents/configure && bunx turbo run build
```

Expected: Build succeeds.

- [ ] Deploy and smoke test:

```bash
cd /Users/lychee/Documents/configure && bun run deploy
```

Then in Pi: create tasks, mark one completed, and confirm both widgets appear.

---

## Self-Review Checklist

- [ ] **Spec coverage:** Every design requirement (split widgets, IDs, ordering, limits, empty hide, colors) maps to a task/step.
- [ ] **No placeholders:** No TBD/TODO/fill-in-later language.
- [ ] **Type consistency:** `Task` type from `types.ts` is used everywhere; widget IDs are consistent.
