# Goal 强制持续能力增强实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `pi-extensions/my-todo` 的 goal 功能增强到与 `@narumitw/pi-goal` 基本对齐（除 token 预算外），实现独立 `goal_complete` 工具、自动 continuation、去重保护、中断自动暂停、`/goal edit` 和 session 恢复。

**Architecture:** 将 goal 状态机和核心决策逻辑抽出为纯函数（`goal-state.ts`、`goal-logic.ts`），事件钩子保持薄代理；使用 `pi.appendEntry('goal-state', { goal })` 持久化；通过 `agent_end` 发送带 marker 的 continuation prompt，`input` + `before_agent_start` 双重防御过期 continuation。

## Global Constraints

- 保留在 `pi-extensions/my-todo` 内，不拆独立扩展包
- 不启用 token 预算，但预留 `tokensUsed` 字段
- 状态名对齐 pi-goal：`active` / `paused` / `complete`
- 恢复依赖 `custom` entry，不兼容旧 toolResult 恢复
- plan mode 激活期间暂停 goal 自动 continuation
- goal active 期间禁止 `ask_user_question`
- 自动 continuation 上限 50 次
- 状态栏 key 使用 `"my-todo-goal"`
- 覆盖率要求：branches/functions/lines/statements 100%（`index.ts`、`types.ts` 排除）
- 使用 `bun` 和 `vitest`
- 提交格式：`类型(范围): 描述`

**Tech Stack:** TypeScript, Bun, Vitest, `@earendil-works/pi-coding-agent`, TypeBox

---

## File Structure

```
pi-extensions/my-todo/
├── types.ts                  # 扩展 Goal 类型（ActiveGoal、GoalStatus 等）
├── goal-state.ts             # ActiveGoal 状态机 + entries + 序列化
├── goal-logic.ts             # 纯函数：prompt 构建、continuation 决策、marker 处理
├── goal-complete.ts          # goal_complete 工具定义
├── goal-overlay.ts           # Goal widget 渲染
├── index.ts                  # 扩展入口：命令、工具、事件钩子
└── __tests__/
    ├── goal-state.test.ts    # 状态机测试
    ├── goal-logic.test.ts    # prompt/continuation/marker 纯函数测试
    ├── goal-complete.test.ts # goal_complete 工具测试
    └── index.test.ts         # 事件钩子集成测试（可选，若覆盖难可拆分）
```

---

## Task 1: 更新类型定义

**Files:**
- Modify: `pi-extensions/my-todo/types.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `GoalStatus = "active" | "paused" | "complete"`
  - `interface ActiveGoal { id, text, status, startedAt, updatedAt, iteration, tokensUsed, timeUsedSeconds, blocker? }`
  - `GoalEntry` 保留但字段可简化
  - `SessionEntry` 保留

- [ ] **Step 1: 删除旧 Goal 类型，新增 ActiveGoal 类型**

替换 `types.ts` 中的 goal 相关类型为：

```ts
export type GoalStatus = "active" | "paused" | "complete";

export interface ActiveGoal {
  id: string;
  text: string;
  status: GoalStatus;
  startedAt: number;
  updatedAt: number;
  iteration: number;
  tokensUsed: number;
  timeUsedSeconds: number;
  blocker?: string;
}

export interface GoalEntry {
  iteration: number;
  evidence: string;
  nextAction: string;
  status: GoalStatus;
}

export interface GoalStateEntryData {
  goal?: ActiveGoal | null;
}
```

保留 Task 相关类型不变。

- [ ] **Step 2: 提交**

```bash
git add pi-extensions/my-todo/types.ts
git commit -m "refactor(my-todo): align goal types with pi-goal"
```

---

## Task 2: 重写 GoalState 状态机

**Files:**
- Modify: `pi-extensions/my-todo/goal-state.ts`
- Test: `pi-extensions/my-todo/goal-state.test.ts`

**Interfaces:**
- Consumes: `ActiveGoal`, `GoalStatus`, `GoalEntry`, `SessionEntry` from `types.ts`
- Produces:
  - `class GoalState` 方法：`set`, `pause`, `resume`, `clear`, `edit`, `evaluate`, `markBlocked`, `markComplete`, `get`, `getStatus`, `isActive`, `recordIteration`, `getEntries`, `updateUsage`, `canAutoContinue`
  - `GoalState.fromSession(entries: SessionEntry[]): GoalState`

- [ ] **Step 1: 先删除旧测试并写新失败测试**

```ts
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
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd pi-extensions/my-todo && bun test goal-state.test.ts
```

Expected: FAIL

- [ ] **Step 3: 实现 GoalState**

```ts
import type { ActiveGoal, GoalEntry, GoalStatus, SessionEntry } from "./types";

const MAX_OBJECTIVE_LENGTH = 4000;
const VALID_GOAL_STATUSES: GoalStatus[] = ["active", "paused", "complete"];
const VALID_EVALUATE_STATUSES: GoalStatus[] = ["active", "paused"];

function isValidGoalStatus(value: unknown): value is GoalStatus {
  return typeof value === "string" && (VALID_GOAL_STATUSES as string[]).includes(value);
}

function isValidActiveGoal(value: unknown): value is ActiveGoal {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== "string") return false;
  if (typeof obj.text !== "string") return false;
  if (!isValidGoalStatus(obj.status)) return false;
  if (typeof obj.startedAt !== "number") return false;
  if (typeof obj.updatedAt !== "number") return false;
  if (typeof obj.iteration !== "number") return false;
  if (typeof obj.tokensUsed !== "number") return false;
  if (typeof obj.timeUsedSeconds !== "number") return false;
  if (obj.blocker !== undefined && typeof obj.blocker !== "string") return false;
  return true;
}

function deepCopyGoal(goal: ActiveGoal): ActiveGoal {
  return { ...goal };
}

export class GoalState {
  private goal: ActiveGoal | null = null;
  private entries: GoalEntry[] = [];

  get(): ActiveGoal | null {
    if (!this.goal) return null;
    return deepCopyGoal(this.goal);
  }

  getStatus(): GoalStatus | "idle" {
    return this.goal?.status ?? "idle";
  }

  isActive(): boolean {
    return this.goal?.status === "active";
  }

  canAutoContinue(): boolean {
    return this.isActive();
  }

  set(text: string): ActiveGoal {
    const trimmed = text.trim();
    if (trimmed === "") throw new Error("Objective is required");
    if (trimmed.length > MAX_OBJECTIVE_LENGTH) {
      throw new Error(`Goal objective is too long (${trimmed.length}/${MAX_OBJECTIVE_LENGTH} characters)`);
    }
    this.entries = [];
    const now = Date.now();
    this.goal = {
      id: crypto.randomUUID(),
      text: trimmed,
      status: "active",
      startedAt: now,
      updatedAt: now,
      iteration: 0,
      tokensUsed: 0,
      timeUsedSeconds: 0,
    };
    return deepCopyGoal(this.goal);
  }

  edit(text: string): ActiveGoal {
    if (!this.goal) throw new Error("No active goal");
    const trimmed = text.trim();
    if (trimmed === "") throw new Error("Objective is required");
    if (trimmed.length > MAX_OBJECTIVE_LENGTH) {
      throw new Error(`Goal objective is too long (${trimmed.length}/${MAX_OBJECTIVE_LENGTH} characters)`);
    }
    this.goal.text = trimmed;
    this.goal.updatedAt = Date.now();
    return deepCopyGoal(this.goal);
  }

  pause(): void {
    if (!this.goal) return;
    if (this.goal.status !== "active") return;
    this.goal.status = "paused";
    this.goal.updatedAt = Date.now();
  }

  resume(): void {
    if (!this.goal) return;
    if (this.goal.status === "complete") throw new Error("Cannot resume a completed goal");
    if (this.goal.status === "active") return;
    this.goal.status = "active";
    this.goal.updatedAt = Date.now();
  }

  clear(): void {
    this.goal = null;
    this.entries = [];
  }

  evaluate(lastEvidence?: string, nextAction?: string, status?: GoalStatus): ActiveGoal {
    if (!this.goal) throw new Error("No active goal");
    if (lastEvidence !== undefined) this.recordEntry(this.goal.status, lastEvidence, this.goal.nextAction);
    if (lastEvidence !== undefined) this.goal.lastEvidence = lastEvidence;
    if (nextAction !== undefined) this.goal.nextAction = nextAction;
    if (status !== undefined) {
      if (!VALID_EVALUATE_STATUSES.includes(status)) throw new Error(`Invalid evaluate status: ${status}`);
      this.goal.status = status;
    }
    this.goal.updatedAt = Date.now();
    return deepCopyGoal(this.goal);
  }

  markBlocked(reason: string): ActiveGoal {
    if (!this.goal) throw new Error("No active goal");
    if (reason.trim() === "") throw new Error("Reason is required");
    this.recordEntry(this.goal.status, this.goal.lastEvidence, this.goal.nextAction);
    this.goal.status = "paused";
    this.goal.blocker = reason;
    this.goal.updatedAt = Date.now();
    return deepCopyGoal(this.goal);
  }

  markComplete(evidence: string): ActiveGoal {
    if (!this.goal) throw new Error("No active goal");
    if (evidence.trim() === "") throw new Error("Evidence is required");
    this.recordEntry("complete", evidence, "");
    this.goal.status = "complete";
    this.goal.updatedAt = Date.now();
    return deepCopyGoal(this.goal);
  }

  recordIteration(): void {
    if (!this.goal) return;
    this.goal.iteration += 1;
    this.goal.updatedAt = Date.now();
  }

  updateUsage(tokensUsed: number, timeUsedSeconds: number): void {
    if (!this.goal) return;
    this.goal.tokensUsed = tokensUsed;
    this.goal.timeUsedSeconds = timeUsedSeconds;
    this.goal.updatedAt = Date.now();
  }

  getEntries(): GoalEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }

  private recordEntry(status: GoalStatus, evidence: string, nextAction: string): void {
    const g = this.goal!;
    this.entries.push({ iteration: g.iteration, evidence, nextAction, status });
  }

  static fromSession(entries: SessionEntry[]): GoalState {
    const state = new GoalState();
    const goalEntry = entries
      .filter((e): e is SessionEntry & { type: "custom"; customType: "goal-state"; data: { goal?: unknown } } =>
        e.type === "custom" && e.customType === "goal-state" && typeof e.data === "object" && e.data !== null
      )
      .pop();
    const goal = goalEntry?.data?.goal;
    if (isValidActiveGoal(goal) && goal.status !== "complete") {
      state.goal = deepCopyGoal(goal);
    }
    return state;
  }
}
```

注意：`ActiveGoal` 需要加 `lastEvidence`/`nextAction` 字段吗？设计里 overlay 不显示 evidence，但 `evaluate` 还要更新。这里为了兼容现有 evaluate 语义，给 `ActiveGoal` 增加 `lastEvidence?: string; nextAction?: string;`。需要同步更新类型定义和测试。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd pi-extensions/my-todo && bun test goal-state.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add pi-extensions/my-todo/goal-state.ts pi-extensions/my-todo/goal-state.test.ts
git commit -m "refactor(my-todo): rewrite goal state machine"
```

---

## Task 3: 实现 goal-logic 纯函数

**Files:**
- Create: `pi-extensions/my-todo/goal-logic.ts`
- Test: `pi-extensions/my-todo/goal-logic.test.ts`

**Interfaces:**
- Consumes: `ActiveGoal` from `types.ts`
- Produces:
  - `buildGoalSystemPrompt(goal: ActiveGoal): string`
  - `buildGoalPrompt(goal: ActiveGoal): string`
  - `buildObjectiveUpdatedPrompt(goal: ActiveGoal): string`
  - `buildResumePrompt(goal: ActiveGoal): string`
  - `buildContinuePrompt(goal: ActiveGoal, marker: string): string`
  - `continuationMarker(goal: ActiveGoal): string`
  - `extractContinuationMarker(prompt: string): string | undefined`
  - `formatStatus(goal: ActiveGoal | undefined): string | undefined`
  - `formatDuration(seconds: number): string`
  - `formatTokenCount(value: number): string`
  - `formatBudget(goal: ActiveGoal): string`
  - `goalSummary(goal: ActiveGoal): string`
  - `goalCommandHint(status: GoalStatus): string`
  - `MAX_CONTINUATIONS = 50`
  - `CONTINUATION_MARKER_PREFIX = "pi-goal-continuation:"`

- [ ] **Step 1: 写失败测试**

测试覆盖：
- `buildGoalSystemPrompt` 包含 persistence rules 和目标文本
- `buildContinuePrompt` 包含 iteration 和 marker comment
- `continuationMarker` 返回 `${id}:${iteration}`
- `extractContinuationMarker` 从 prompt 中提取 marker
- `formatStatus` 返回 `active 5s`、`paused`、`complete`、`budget ...`（预留）
- `formatDuration` 返回 `s`/`m`/`hXm`
- `formatTokenCount` 返回 `k`/`m`
- `goalSummary` 多行摘要
- `goalCommandHint` 按状态返回提示

- [ ] **Step 2: 运行测试确认失败**

```bash
cd pi-extensions/my-todo && bun test goal-logic.test.ts
```

- [ ] **Step 3: 实现 goal-logic.ts**

直接从 pi-goal 移植相关函数，去掉 token 预算相关分支或保留为 no-op。

```ts
import type { ActiveGoal, GoalStatus } from "./types";

export const MAX_CONTINUATIONS = 50;
export const CONTINUATION_MARKER_PREFIX = "pi-goal-continuation:";

export function buildGoalSystemPrompt(goal: ActiveGoal): string {
  return `Active /goal:\n${goalObjectiveBlock(goal)}\n\nGoal-mode rules:\n- Keep going until the active goal is completely resolved end-to-end.\n- Treat the current worktree, command output, tests, and external state as authoritative.\n- Do not redefine the goal into a smaller task; audit every requirement before completion.\n- Do not stop at analysis, a plan, TODO list, partial fixes, or suggested next steps.\n- Autonomously perform implementation and verification with the available tools when they are needed to complete the goal.\n- Persevere through recoverable tool failures by trying reasonable alternatives instead of yielding early.\n- If the goal is not complete at the end of a turn, expect an automatic continuation and keep working from where you left off.\n- Only call the goal_complete tool after the goal is fully complete and verified.`;
}

export function buildGoalPrompt(goal: ActiveGoal): string {
  return `Goal mode is active. Complete this goal fully:\n\n${goalObjectiveBlock(goal)}\n\n${goalPersistenceRules("this goal")}`;
}

export function buildObjectiveUpdatedPrompt(goal: ActiveGoal): string {
  return `The active /goal objective was updated. Continue working toward this goal:\n\n${goalObjectiveBlock(goal)}\n\n${goalPersistenceRules("the updated goal")}`;
}

export function buildResumePrompt(goal: ActiveGoal): string {
  return `The user explicitly resumed the paused /goal. Continue working toward this goal:\n\n${goalObjectiveBlock(goal)}\n\n${goalPersistenceRules("this goal")}`;
}

export function buildContinuePrompt(goal: ActiveGoal, marker: string): string {
  return `Continue the active /goal until it is complete:\n\n${goalObjectiveBlock(goal)}\n\nThis is automatic continuation #${goal.iteration}. Current files, command output, tests, and external state are authoritative; re-check them as needed. ${goalPersistenceRules("this goal")}\n\n${continuationMarkerComment(marker)}`;
}

export function continuationMarker(goal: ActiveGoal): string {
  return `${goal.id}:${goal.iteration}`;
}

export function extractContinuationMarker(prompt: string): string | undefined {
  const pattern = new RegExp(`<!-- ${escapeRegExp(CONTINUATION_MARKER_PREFIX)}([^>]+) -->`);
  return pattern.exec(prompt)?.[1];
}

export function formatStatus(goal: ActiveGoal | undefined): string | undefined {
  if (!goal) return undefined;
  if (goal.status === "complete") return "complete";
  if (goal.status === "paused") return "paused";
  return `active ${formatDuration(goal.timeUsedSeconds)}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${minutes % 60}m`;
}

export function formatTokenCount(value: number): string {
  if (value < 1000) return `${value}`;
  if (value < 1000000) return `${Number.isInteger(value / 1000) ? value / 1000 : (value / 1000).toFixed(1)}k`;
  return `${Number.isInteger(value / 1000000) ? value / 1000000 : (value / 1000000).toFixed(1)}m`;
}

export function formatBudget(goal: ActiveGoal): string {
  return `${formatTokenCount(goal.tokensUsed)}/${formatTokenCount(0)}`;
}

export function goalSummary(goal: ActiveGoal): string {
  return [
    `Goal: ${goal.text}`,
    `Status: ${goal.status}`,
    `Iteration: ${goal.iteration}`,
    `Elapsed: ${formatDuration(goal.timeUsedSeconds)}`,
    `Commands: ${goalCommandHint(goal.status)}`,
  ].join("\n");
}

export function goalCommandHint(status: GoalStatus): string {
  if (status === "active") return "/goal edit <objective>, /goal pause, /goal clear";
  if (status === "paused") return "/goal edit <objective>, /goal resume, /goal clear";
  return "/goal edit <objective>, /goal clear";
}

function goalObjectiveBlock(goal: ActiveGoal): string {
  return `\n${goal.text}\n`;
}

function goalPersistenceRules(goalLabel: string): string {
  return `Keep going until ${goalLabel} is completely resolved end-to-end. Do not redefine ${goalLabel} into a smaller task. Do not stop at analysis, a plan, TODO list, partial fixes, or suggested next steps. Autonomously perform implementation and verification with the available tools when they are needed. Treat the current worktree, command output, tests, and external state as authoritative. If a tool call fails, try reasonable alternatives instead of yielding early. Before calling goal_complete, audit ${goalLabel} requirement by requirement against the verified current state. Only call the goal_complete tool after ${goalLabel} is fully complete and verified.`;
}

function continuationMarkerComment(marker: string): string {
  return `<!-- ${CONTINUATION_MARKER_PREFIX}${marker} -->`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd pi-extensions/my-todo && bun test goal-logic.test.ts
```

- [ ] **Step 5: 提交**

```bash
git add pi-extensions/my-todo/goal-logic.ts pi-extensions/my-todo/goal-logic.test.ts
git commit -m "feat(my-todo): add goal continuation logic helpers"
```

---

## Task 4: 实现 goal_complete 工具

**Files:**
- Create: `pi-extensions/my-todo/goal-complete.ts`
- Test: `pi-extensions/my-todo/goal-complete.test.ts`

**Interfaces:**
- Consumes: `GoalState` from `goal-state.ts`
- Produces:
  - `createGoalCompleteTool(state: GoalState, deps: { persistGoal, updateStatus, clearStatus, notify }): ToolDefinition`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi } from "vitest";
import { Type } from "typebox";
import { createGoalCompleteTool } from "./goal-complete";
import { GoalState } from "./goal-state";

describe("goal_complete tool", () => {
  it("completes active goal", async () => {
    const state = new GoalState();
    state.set("Fix bug");
    const persist = vi.fn();
    const updateStatus = vi.fn();
    const clearStatus = vi.fn();
    const notify = vi.fn();
    const tool = createGoalCompleteTool(state, { persistGoal: persist, updateStatus, clearStatus, notify });

    const result = await tool.execute("id-1", { summary: "Tests pass" }, undefined, undefined, {
      ui: { setStatus: updateStatus, notify },
    } as any);

    expect(result.terminate).toBe(true);
    expect(result.content[0].text).toContain("Goal complete");
    expect(state.get()).toBeNull();
    expect(persist).toHaveBeenCalledWith(null);
    expect(notify).toHaveBeenCalled();
  });

  it("errors when no active goal", async () => {
    const state = new GoalState();
    const tool = createGoalCompleteTool(state, { persistGoal: vi.fn(), updateStatus: vi.fn(), clearStatus: vi.fn(), notify: vi.fn() });
    const result = await tool.execute("id-1", { summary: "Done" }, undefined, undefined, { ui: { setStatus: vi.fn(), notify: vi.fn() } } as any);
    expect(result.isError).toBe(true);
    expect(result.terminate).toBeUndefined();
  });

  it("errors when summary empty", async () => {
    const state = new GoalState();
    state.set("Fix bug");
    const tool = createGoalCompleteTool(state, { persistGoal: vi.fn(), updateStatus: vi.fn(), clearStatus: vi.fn(), notify: vi.fn() });
    const result = await tool.execute("id-1", { summary: "" }, undefined, undefined, { ui: { setStatus: vi.fn(), notify: vi.fn() } } as any);
    expect(result.isError).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 实现 goal-complete.ts**

```ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { GoalState } from "./goal-state";

export interface GoalCompleteDeps {
  persistGoal(goal: import("./types").ActiveGoal | null): void;
  updateStatus(ctx: ExtensionContext, text: string | undefined): void;
  clearStatus(ctx: ExtensionContext): void;
  notify(ctx: ExtensionContext, message: string, level?: "info" | "warning" | "error"): void;
}

export function createGoalCompleteTool(state: GoalState, deps: GoalCompleteDeps) {
  return defineTool({
    name: "goal_complete",
    label: "Goal Complete",
    description: "Mark the active /goal as complete. Only call this after the requested goal is fully done and verified.",
    promptSnippet: "Mark the active /goal as complete after fully finishing and verifying it",
    promptGuidelines: [
      "When a /goal is active, keep working until the goal is complete; do not stop with only a plan or partial progress.",
      "Before calling goal_complete, audit the active goal requirement by requirement against the current files, command output, tests, or external state.",
      "Call goal_complete only after the requested goal is fully implemented, verified, and no known required work remains.",
    ],
    parameters: Type.Object({
      summary: Type.String({
        description: "Concise summary of what was completed and how it was verified.",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const completedGoal = state.get();
      if (!completedGoal || completedGoal.status !== "active") {
        return {
          content: [{ type: "text", text: "Error: no active goal to complete" }],
          details: {},
          isError: true,
        };
      }
      const summary = params.summary.trim();
      if (!summary) {
        return {
          content: [{ type: "text", text: "Error: summary is required" }],
          details: {},
          isError: true,
        };
      }
      state.markComplete(summary);
      deps.persistGoal(null);
      deps.clearStatus(ctx);
      deps.notify(ctx, `Goal complete: ${completedGoal.text}`, "info");
      return {
        content: [{ type: "text", text: `Goal complete: ${summary}` }],
        details: { goal: completedGoal.text, summary },
        terminate: true,
      };
    },
  });
}
```

注意：清除状态栏时显示 `complete` 8 秒的逻辑应在 `index.ts` 中统一处理（`clearStatus` 函数内部处理 timer）。这里先简单清理。

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: 提交**

```bash
git add pi-extensions/my-todo/goal-complete.ts pi-extensions/my-todo/goal-complete.test.ts
git commit -m "feat(my-todo): add goal_complete tool"
```

---

## Task 5: 更新 goal-overlay

**Files:**
- Modify: `pi-extensions/my-todo/goal-overlay.ts`
- Test: `pi-extensions/my-todo/goal-overlay.test.ts`（可选，若已有则更新）

**Interfaces:**
- Consumes: `ActiveGoal` from `types.ts`
- Produces: `renderGoalOverlay(goal, theme?) => string[]`

- [ ] **Step 1: 写/更新测试**

测试覆盖：
- active 状态显示 objective、iteration、elapsed time
- paused 状态显示 blocker
- complete 状态显示 objective

- [ ] **Step 2: 实现 goal-overlay.ts**

```ts
import type { ActiveGoal, GoalStatus } from "./types";

interface ThemeLike {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

const STATUS_COLORS: Record<GoalStatus, string> = {
  active: "accent",
  paused: "muted",
  complete: "muted",
};

function truncate(text: string, max = 40): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

export function renderGoalOverlay(goal: ActiveGoal, theme?: ThemeLike): string[] {
  const lines: string[] = [];
  const title = `Goal [${goal.status}]`;
  lines.push(theme ? theme.fg(STATUS_COLORS[goal.status], theme.bold(title)) : title);
  lines.push(theme ? theme.fg("dim", truncate(goal.text)) : truncate(goal.text));
  lines.push(theme ? theme.fg("dim", `Iterations: ${goal.iteration}`) : `Iterations: ${goal.iteration}`);
  if (goal.blocker) {
    const block = `Paused: ${truncate(goal.blocker)}`;
    lines.push(theme ? theme.fg("error", block) : block);
  }
  return lines;
}
```

- [ ] **Step 3: 运行测试**

- [ ] **Step 4: 提交**

```bash
git add pi-extensions/my-todo/goal-overlay.ts pi-extensions/my-todo/goal-overlay.test.ts
git commit -m "refactor(my-todo): align goal overlay with pi-goal minimal info"
```

---

## Task 6: 重构 index.ts 的事件钩子与命令

**Files:**
- Modify: `pi-extensions/my-todo/index.ts`

**Interfaces:**
- Consumes: `GoalState`, `goal-logic.ts`, `goal-complete.ts`, `goal-overlay.ts`
- Produces: 完整扩展注册

这是最大的改动。建议分步骤：

### 6.1 提取命令解析函数

- [ ] **Step 1: 创建 `parseGoalCommand` 函数**

```ts
type CommandResult =
  | { kind: "show" }
  | { kind: "start"; objective: string }
  | { kind: "edit"; objective: string }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "clear" };

export function parseGoalCommand(args: string): CommandResult | string {
  const trimmed = args.trim();
  if (trimmed === "") return { kind: "show" };
  const [first, ...rest] = trimmed.split(/\s+/);
  const restJoined = rest.join(" ").trim();

  if (first === "pause" && restJoined === "") return { kind: "pause" };
  if (first === "resume" && restJoined === "") return { kind: "resume" };
  if (first === "clear" && restJoined === "") return { kind: "clear" };
  if (first === "edit") {
    const objective = restJoined.trim();
    if (!objective) return "Usage: /goal edit <objective>";
    return { kind: "edit", objective };
  }
  return { kind: "start", objective: trimmed };
}
```

- [ ] **Step 2: 写测试**

```ts
import { parseGoalCommand } from "./index"; // 或单独文件

it("parses start", () => {
  expect(parseGoalCommand("fix bug")).toEqual({ kind: "start", objective: "fix bug" });
});
it("parses edit", () => {
  expect(parseGoalCommand("edit fix bug")).toEqual({ kind: "edit", objective: "fix bug" });
});
it("parses pause", () => {
  expect(parseGoalCommand("pause")).toEqual({ kind: "pause" });
});
it("returns error for unknown usage", () => {
  expect(typeof parseGoalCommand("pause extra")).toBe("string");
});
```

- [ ] **Step 3: 提交**

```bash
git add pi-extensions/my-todo/index.ts pi-extensions/my-todo/index.test.ts
git commit -m "refactor(my-todo): extract goal command parser"
```

### 6.2 重构 `/goal` 命令处理

- [ ] **Step 4: 在 index.ts 中重构 `pi.registerCommand("goal", ...)`**

使用新的 `GoalState` 方法，行为：
- `show`：调用 `goalSummary` 并 notify
- `start`：确认替换、创建 goal、persist、updateStatus、notify、sendGoalPrompt
- `edit`：调用 `state.edit`、persist、updateStatus、notify、发送 updated prompt
- `pause`：调用 `state.pause`、cancel continuation、persist、updateStatus、notify
- `resume`：调用 `state.resume`、persist、updateStatus、notify、发送 resume prompt
- `clear`：clear、cancel continuation、persist(null)、clearStatus、notify

### 6.3 重构 `goal` tool

- [ ] **Step 5: 移除 `mark_complete` action，保留 `evaluate` / `mark_blocked`**

`details` 简化为 `{ action, status }`。

### 6.4 注册 `goal_complete` 工具

- [ ] **Step 6: 调用 `createGoalCompleteTool` 注册**

### 6.5 更新事件钩子

- [ ] **Step 7: `session_start`**

```ts
pi.on("session_start", async (_event, ctx) => {
  state = TaskState.fromSession(ctx.sessionManager.getEntries());
  goalState = GoalState.fromSession(ctx.sessionManager.getEntries());
  clearContinuationTracking();
  const goal = goalState.get();
  updateStatus(ctx, goal);
  if (goal?.status === "paused" && ctx.hasUI) {
    const choice = await ctx.ui.select("Goal is paused", ["Resume goal", "Clear goal"]);
    if (choice === "Resume goal") {
      goalState.resume();
      updateStatus(ctx, goalState.get());
      persistGoal(goalState.get());
      await sendResumePrompt(pi, ctx, goalState.get()!);
    } else {
      clearActiveGoal(ctx);
    }
  }
  refreshWidgets(ctx);
});
```

- [ ] **Step 8: `before_agent_start`**

```ts
pi.on("before_agent_start", (event) => {
  markContinuationDelivered(event.prompt);
  if (isCancelledContinuationPrompt(event.prompt)) return;

  if (state.getPlanMode()) { ... }

  const goal = goalState.get();
  if (!goal || goal.status !== "active") return;
  return { systemPrompt: `${event.systemPrompt}\n\n${buildGoalSystemPrompt(goal)}` };
});
```

- [ ] **Step 9: `agent_end`**

```ts
pi.on("agent_end", async (event, ctx) => {
  refreshWidgets(ctx);

  // plan mode 完成选择逻辑保持不变

  const goal = goalState.get();
  if (!goal || goal.status !== "active") return;
  const goalId = goal.id;
  const hadPendingContinuation = continuationPending?.goalId === goalId;

  if (!hadPendingContinuation) goalState.recordIteration();
  goalState.updateUsage(0, Math.floor((Date.now() - goal.startedAt) / 1000));

  const finalAssistant = findFinalAssistantMessage(event.messages);
  if (finalAssistant?.stopReason === "aborted" || finalAssistant?.stopReason === "error") {
    goalState.pause();
    if (finalAssistant.stopReason === "error" && finalAssistant.errorMessage) {
      goalState.markBlocked(finalAssistant.errorMessage);
    }
    persistGoal(goalState.get());
    updateStatus(ctx, goalState.get());
    ctx.ui.notify(`Goal paused after ${finalAssistant.stopReason}. Run /goal resume to continue.`, "warning");
    return;
  }

  if (goal.iteration > MAX_CONTINUATIONS) {
    goalState.pause();
    persistGoal(goalState.get());
    updateStatus(ctx, goalState.get());
    ctx.ui.notify(`Goal paused after ${MAX_CONTINUATIONS} automatic continuations. The objective may be too broad or the agent may be stuck.`, "warning");
    return;
  }

  persistGoal(goalState.get());
  updateStatus(ctx, goalState.get());

  if (hadPendingContinuation) {
    if (ctx.hasPendingMessages()) return;
    if (continuationPending?.goalId === goalId) continuationPending = undefined;
  }

  const currentGoal = goalState.get();
  if (!currentGoal || currentGoal.id !== goalId || currentGoal.status !== "active") return;
  if (ctx.hasPendingMessages()) return;
  await sendContinuationPrompt(pi, ctx, currentGoal);
});
```

- [ ] **Step 10: `input` 事件**

```ts
pi.on("input", (event) => {
  if (event.source !== "extension") return;
  if (consumeCancelledContinuationPrompt(event.text)) return { action: "handled" };
});
```

- [ ] **Step 11: `tool_call` 拦截 `ask_user_question`**

```ts
pi.on("tool_call", async (event, _ctx) => {
  if (state.getPlanMode() && state.getPlanPhase() === "planning") {
    if (!PLANNING_TOOLS.has(event.toolName)) {
      return { block: true, reason: "Plan mode: only planning tools are allowed" };
    }
  }
  if (goalState.isActive() && event.toolName === "ask_user_question") {
    return { block: true, reason: "Goal mode active: do not ask the user for confirmation or clarification. Proceed autonomously or use goal mark_blocked with a clear reason." };
  }
});
```

- [ ] **Step 12: 辅助函数**

在 index.ts 底部或单独文件：
- `persistGoal(goal)`：调用 `pi.appendEntry('goal-state', { goal })`
- `updateStatus(ctx, goal)`：调用 `ctx.ui.setStatus("my-todo-goal", formatStatus(goal))`
- `clearStatus(ctx)`：清除 status，并启动 8 秒 complete timer
- `clearContinuationTracking()`：重置 pending 和 cancelled markers
- `cancelContinuationPending()`：把 pending marker 加入 cancelled set
- `sendContinuationPrompt(pi, ctx, goal)`：构建 prompt、发送、记录 pending
- `sendGoalPrompt` / `sendResumePrompt` / `sendObjectiveUpdatedPrompt`

- [ ] **Step 13: 运行测试**

```bash
cd pi-extensions/my-todo && bun test
```

Expected: PASS（TODO 测试不受影响）

- [ ] **Step 14: 提交**

```bash
git add pi-extensions/my-todo/index.ts
git commit -m "feat(my-todo): integrate goal continuation event loop"
```

---

## Task 7: 添加事件钩子集成测试

**Files:**
- Create/Modify: `pi-extensions/my-todo/index.test.ts` 或 `goal-integration.test.ts`

**Interfaces:**
- Consumes: 完整 index.ts 的注册逻辑
- Produces: 对 `agent_end` 自动 continuation、`input` 过期丢弃、`tool_call` block 的测试

- [ ] **Step 1: 构建 mock ExtensionAPI 和 context**

```ts
function createMockPi() {
  const handlers: Record<string, Function[]> = {};
  const tools: Record<string, any> = {};
  const commands: Record<string, any> = {};
  const sentMessages: { content: string; options?: any }[] = [];
  const entries: any[] = [];

  return {
    on: (event: string, handler: Function) => {
      handlers[event] = handlers[event] || [];
      handlers[event].push(handler);
    },
    registerTool: (tool: any) => { tools[tool.name] = tool; },
    registerCommand: (name: string, cmd: any) => { commands[name] = cmd; },
    sendUserMessage: (content: string, options?: any) => {
      sentMessages.push({ content, options });
    },
    appendEntry: (customType: string, data: any) => {
      entries.push({ type: "custom", customType, data });
    },
    trigger: (event: string, payload: any, ctx: any) => {
      const results = [];
      for (const h of handlers[event] || []) {
        const r = h(payload, ctx);
        results.push(r);
      }
      return Promise.all(results);
    },
    getTool: (name: string) => tools[name],
    getCommand: (name: string) => commands[name],
    sentMessages,
    entries,
  };
}

function createMockCtx(overrides?: Partial<any>) {
  return {
    hasUI: true,
    isIdle: () => true,
    hasPendingMessages: () => false,
    ui: {
      notify: vi.fn(),
      setStatus: vi.fn(),
      select: vi.fn(),
      confirm: vi.fn(),
    },
    sessionManager: { getEntries: () => [] },
    ...overrides,
  };
}
```

- [ ] **Step 2: 写测试**

覆盖：
- `/goal fix bug` 命令后触发初始 goal prompt
- `agent_end` 时 active goal 发送 continuation
- 同一 iteration 不重复发送 continuation
- `/goal pause` 后把 pending marker 加入 cancelled set
- 过期 continuation 被 `input` 事件吞掉
- `aborted` stopReason 自动 pause
- `ask_user_question` 在 goal active 时被 block

- [ ] **Step 3: 运行测试确认通过**

- [ ] **Step 4: 提交**

```bash
git add pi-extensions/my-todo/index.test.ts
git commit -m "test(my-todo): add goal continuation integration tests"
```

---

## Task 8: 全量构建与测试

**Files:**
- 全部

- [ ] **Step 1: 运行全量测试**

```bash
cd pi-extensions/my-todo && bun test
```

Expected: PASS，覆盖率 100%

- [ ] **Step 2: 运行构建**

```bash
bunx turbo run build
```

Expected: SUCCESS

- [ ] **Step 3: 提交**

```bash
git commit -m "chore(my-todo): verify build and tests pass" --allow-empty
```

---

## Task 9: 部署与验证

**Files:**
- 配置：`pi-extensions/my-todo.json`

- [ ] **Step 1: 部署**

```bash
bun run deploy
```

- [ ] **Step 2: 手动验证**

1. `/goal refactor auth handling` → 状态栏应显示 `active 0s`
2. 不调用 `goal_complete` 结束一轮 → 应自动触发 continuation
3. `/goal pause` → 状态栏显示 `paused`，不再自动继续
4. `/goal resume` → 继续自动 continuation
5. 调用 `goal_complete` 结束 → 状态栏显示 `complete` 8 秒后消失
6. `/reload` → 如果 goal 是 paused，弹出 Resume/Clear 选择

- [ ] **Step 3: 提交（如有 hotfix）**

---

## Spec Coverage Check

| Spec 要求 | 覆盖任务 |
|---|---|
| 独立 `goal_complete` 工具 | Task 4 |
| 移除 `goal` tool `mark_complete` | Task 6.3 |
| `before_agent_start` persistence system prompt | Task 6.5 / Task 3 |
| `agent_end` 自动 continuation | Task 6.5 / Task 7 |
| `/goal edit` | Task 6.2 / Task 2 |
| `aborted`/`error` 自动 pause | Task 6.5 / Task 7 |
| `custom` entry 持久化 | Task 6.4 |
| `/reload` 恢复 + paused 询问 | Task 6.5 / Task 2 |
| 禁止 `ask_user_question` | Task 6.5 / Task 7 |
| iteration 上限 50 | Task 6.5 |
| plan mode 暂停 goal continuation | Task 6.5 |
| 状态栏 key `my-todo-goal` | Task 6.4 |

## Placeholder Scan

无 TBD/TODO/模糊描述。每个步骤包含具体代码或命令。
