# my-hud Git Status 展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 my-hud 的 aboveEditor bar 中展示与 starship `git_status` 对齐的 Git 状态信息（ahead/behind/diverged、staged、stashed、conflicted）。

**Architecture:** 新增 `git.ts` 纯函数模块负责 git 命令执行与解析；`render.ts` 增加状态格式化；`bar.ts` 增加 5 秒 TTL 异步缓存避免阻塞 TUI；`index.ts` 在分支变更和回合事件中触发刷新。

**Tech Stack:** TypeScript, vitest, node:child_process, pi ExtensionAPI

---

## File Map

| 文件 | 动作 | 职责 |
|------|------|------|
| `git.ts` | 新建 | 执行 `git status --porcelain=v2 --branch` 和 `git stash list`，解析为结构化 `GitStatus` |
| `types.ts` | 修改 | `StatusLineData` 增加 `gitStatus` 字段；新增 `GitStatus` 接口 |
| `render.ts` | 修改 | `buildStatusLine` 在 Branch 后追加 `formatGitStatus` 渲染的状态字符串 |
| `bar.ts` | 修改 | 增加 `gitStatus` 缓存字段、`invalidateGitStatus()`、异步刷新逻辑 |
| `index.ts` | 修改 | `turn_start` / `turn_end` / `branch_change` 时调用 `invalidateGitStatus()` |
| `git.test.ts` | 新建 | `parseGitStatus` 单元测试 |
| `index.test.ts` | 修改 | 补充 `formatGitStatus` 和 Bar 缓存行为测试；顶部增加 `./git` 模块 mock |

---

## Task 1: 新增 `git.ts` — Git 状态获取与解析

**Files:**
- Create: `pi-extensions/my-hud/git.ts`
- Test: `pi-extensions/my-hud/git.test.ts`

- [ ] **Step 1: 写 `git.ts` 实现**

```typescript
/**
 * Git status fetching and parsing.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { GitStatus } from "./types";

const execAsync = promisify(exec);

/**
 * Fetch git status for the given directory.
 * Returns null if not a git repo or git is unavailable.
 */
export async function getGitStatus(cwd: string): Promise<GitStatus | null> {
  try {
    const [statusResult, stashResult] = await Promise.all([
      execAsync("git status --porcelain=v2 --branch", { cwd, timeout: 3000 }),
      execAsync("git stash list", { cwd, timeout: 3000 }),
    ]);
    return parseGitStatus(statusResult.stdout, stashResult.stdout);
  } catch {
    return null;
  }
}

/**
 * Parse git status --porcelain=v2 --branch output.
 */
export function parseGitStatus(statusOutput: string, stashOutput: string): GitStatus {
  const lines = statusOutput.split("\n");

  let ahead = 0;
  let behind = 0;
  let staged = 0;
  let conflicted = 0;

  for (const line of lines) {
    if (line.startsWith("# branch.ab")) {
      const match = line.match(/\+(\d+) -(\d+)/);
      if (match) {
        ahead = parseInt(match[1], 10);
        behind = parseInt(match[2], 10);
      }
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const parts = line.split(" ");
      const xy = parts[1] ?? "..";
      const x = xy[0] ?? ".";
      const y = xy[1] ?? ".";

      if (x === "U" || y === "U") {
        conflicted++;
      } else if (x !== "." && x !== "?" && x !== "!") {
        staged++;
      }
    }
  }

  const stashed = stashOutput.trim() ? stashOutput.trim().split("\n").length : 0;
  const isClean = ahead === 0 && behind === 0 && staged === 0 && stashed === 0 && conflicted === 0;

  return { ahead, behind, staged, stashed, conflicted, isClean };
}
```

- [ ] **Step 2: 写 `git.test.ts` 测试**

```typescript
import { describe, it, expect } from "vitest";
import { parseGitStatus } from "./git";

describe("parseGitStatus", () => {
  it("returns clean for repo with no changes", () => {
    const status = parseGitStatus("# branch.oid abc\n# branch.head main\n", "");
    expect(status).toEqual({
      ahead: 0,
      behind: 0,
      staged: 0,
      stashed: 0,
      conflicted: 0,
      isClean: true,
    });
  });

  it("parses ahead count", () => {
    const status = parseGitStatus(
      "# branch.oid abc\n# branch.head main\n# branch.ab +2 -0\n",
      ""
    );
    expect(status.ahead).toBe(2);
    expect(status.behind).toBe(0);
    expect(status.isClean).toBe(false);
  });

  it("parses behind count", () => {
    const status = parseGitStatus(
      "# branch.oid abc\n# branch.head main\n# branch.ab +0 -3\n",
      ""
    );
    expect(status.behind).toBe(3);
    expect(status.isClean).toBe(false);
  });

  it("parses diverged", () => {
    const status = parseGitStatus(
      "# branch.oid abc\n# branch.head main\n# branch.ab +2 -3\n",
      ""
    );
    expect(status.ahead).toBe(2);
    expect(status.behind).toBe(3);
    expect(status.isClean).toBe(false);
  });

  it("counts staged files", () => {
    const output = [
      "# branch.oid abc",
      "# branch.head main",
      '1 M. N... 100644 100644 100644 abc def path1',
      '1 A. N... 100644 100644 100644 abc def path2',
    ].join("\n");
    const status = parseGitStatus(output, "");
    expect(status.staged).toBe(2);
    expect(status.isClean).toBe(false);
  });

  it("counts conflicted files", () => {
    const output = [
      "# branch.oid abc",
      "# branch.head main",
      '1 UU N... 100644 100644 100644 abc def path1',
      '1 .U N... 100644 100644 100644 abc def path2',
    ].join("\n");
    const status = parseGitStatus(output, "");
    expect(status.conflicted).toBe(2);
    expect(status.staged).toBe(0);
  });

  it("does not count conflicted as staged", () => {
    const output = [
      "# branch.oid abc",
      "# branch.head main",
      '1 AU N... 100644 100644 100644 abc def path1',
    ].join("\n");
    const status = parseGitStatus(output, "");
    expect(status.conflicted).toBe(1);
    expect(status.staged).toBe(0);
  });

  it("ignores untracked files", () => {
    const output = [
      "# branch.oid abc",
      "# branch.head main",
      '1 ?. N... 100644 100644 100644 abc def path1',
    ].join("\n");
    const status = parseGitStatus(output, "");
    expect(status.staged).toBe(0);
    expect(status.isClean).toBe(true);
  });

  it("counts stashes", () => {
    const status = parseGitStatus(
      "# branch.oid abc\n# branch.head main\n",
      "stash@{0}\nstash@{1}"
    );
    expect(status.stashed).toBe(2);
    expect(status.isClean).toBe(false);
  });

  it("handles rename entries (type 2)", () => {
    const output = [
      "# branch.oid abc",
      "# branch.head main",
      '2 R. N... 100644 100644 100644 abc def path1\tpath2',
    ].join("\n");
    const status = parseGitStatus(output, "");
    expect(status.staged).toBe(1);
  });
});
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cd pi-extensions/my-hud && npx vitest run git.test.ts`
Expected: 10 tests PASS

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-hud/git.ts pi-extensions/my-hud/git.test.ts
git commit -m "feat(my-hud): add git status parsing module"
```

---

## Task 2: 扩展类型定义

**Files:**
- Modify: `pi-extensions/my-hud/types.ts`

- [ ] **Step 1: 修改 `types.ts`**

```typescript
/**
 * Shared types for my-hud.
 */

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

export interface GitStatus {
  ahead: number;
  behind: number;
  staged: number;
  stashed: number;
  conflicted: number;
  isClean: boolean;
}

export interface StatusLineData {
  project: string;
  modelName: string;
  branch: string | null;
  ctxColored: string;
  usage: TokenUsage;
  gitStatus?: GitStatus | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add pi-extensions/my-hud/types.ts
git commit -m "feat(my-hud): add GitStatus type and extend StatusLineData"
```

---

## Task 3: 修改 `render.ts` — 追加 Git 状态渲染

**Files:**
- Modify: `pi-extensions/my-hud/render.ts`
- Test: `pi-extensions/my-hud/index.test.ts`（追加 `formatGitStatus` 测试）

- [ ] **Step 1: 修改 `render.ts`**

```typescript
/**
 * Status line assembly.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { icon } from "./icons";
import { formatTokens, shortModelName, formatCacheRate } from "./format";
import type { StatusLineData, GitStatus } from "./types";

export function buildStatusLine(
  theme: Theme,
  width: number,
  data: StatusLineData,
): string {
  const { project: rawProject, modelName, branch, ctxColored, usage, gitStatus } = data;
  const project = rawProject.length > 10 ? rawProject.slice(0, 8) + ".." : rawProject;
  const parts: string[] = [
    theme.fg("mdCode", `${icon("project")}${project}`),
    theme.fg("mdHeading", `${icon("model")}${shortModelName(modelName.trim())}`),
  ];

  if (branch) {
    parts.push(theme.fg("customMessageLabel", `${icon("branch")}${branch}`));
    const gitStatusStr = formatGitStatus(theme, gitStatus);
    if (gitStatusStr) {
      parts.push(gitStatusStr);
    }
  }

  parts.push(
    ctxColored,
    theme.fg("mdListBullet", `${icon("input")}${formatTokens(usage.input)}`),
    theme.fg("thinkingLow", `${icon("output")}${formatTokens(usage.output)}`),
    theme.fg("thinkingMedium", `${icon("cacheRead")}${formatTokens(usage.cacheRead)}`),
    theme.fg("toolDiffRemoved", `${icon("cost")}${usage.cost.toFixed(2)}`),
    theme.fg("accent", `${icon("cacheRate")}${formatCacheRate(usage.input, usage.cacheRead)}`),
  );

  return truncateToWidth(parts.join(" "), width);
}

/**
 * Format GitStatus into a colored string matching starship git_status style.
 * Returns empty string if status is null or clean.
 */
export function formatGitStatus(theme: Theme, status: GitStatus | null | undefined): string {
  if (!status || status.isClean) return "";

  const parts: string[] = [];

  if (status.staged > 0) {
    parts.push(theme.fg("accent", `++${status.staged}|`));
  }
  if (status.stashed > 0) {
    parts.push(theme.fg("warning", `*${status.stashed}|`));
  }
  if (status.conflicted > 0) {
    parts.push(theme.fg("error", `!!${status.conflicted}|`));
  }
  if (status.ahead > 0 && status.behind > 0) {
    parts.push(theme.fg("warning", `⇕⇡${status.ahead}⇣${status.behind}`));
  } else if (status.ahead > 0) {
    parts.push(theme.fg("accent", `⇡${status.ahead}`));
  } else if (status.behind > 0) {
    parts.push(theme.fg("warning", `⇣${status.behind}`));
  }

  return parts.join("");
}
```

- [ ] **Step 2: 在 `index.test.ts` 顶部添加 `./git` mock**

在现有 `vi.mock` 块之后、测试代码之前添加：

```typescript
vi.mock("./git", () => ({
  getGitStatus: vi.fn(() =>
    Promise.resolve({
      ahead: 0,
      behind: 0,
      staged: 0,
      stashed: 0,
      conflicted: 0,
      isClean: true,
    })
  ),
}));
```

- [ ] **Step 3: 在 `index.test.ts` 追加 `formatGitStatus` 测试**

在 `describe("buildStatusLine", ...)` 之前插入：

```typescript
describe("formatGitStatus", () => {
  const mockTheme = { fg: vi.fn((_c: string, text: string) => text) };

  it("returns empty for null status", async () => {
    const { formatGitStatus } = await loadModule();
    expect(formatGitStatus(mockTheme as any, null)).toBe("");
  });

  it("returns empty for clean status", async () => {
    const { formatGitStatus } = await loadModule();
    const status = { ahead: 0, behind: 0, staged: 0, stashed: 0, conflicted: 0, isClean: true };
    expect(formatGitStatus(mockTheme as any, status)).toBe("");
  });

  it("formats ahead only", async () => {
    const { formatGitStatus } = await loadModule();
    const status = { ahead: 2, behind: 0, staged: 0, stashed: 0, conflicted: 0, isClean: false };
    expect(formatGitStatus(mockTheme as any, status)).toBe("⇡2");
  });

  it("formats behind only", async () => {
    const { formatGitStatus } = await loadModule();
    const status = { ahead: 0, behind: 3, staged: 0, stashed: 0, conflicted: 0, isClean: false };
    expect(formatGitStatus(mockTheme as any, status)).toContain("⇣3");
  });

  it("formats diverged", async () => {
    const { formatGitStatus } = await loadModule();
    const status = { ahead: 3, behind: 2, staged: 0, stashed: 0, conflicted: 0, isClean: false };
    expect(formatGitStatus(mockTheme as any, status)).toContain("⇕⇡3⇣2");
  });

  it("formats staged", async () => {
    const { formatGitStatus } = await loadModule();
    const status = { ahead: 0, behind: 0, staged: 3, stashed: 0, conflicted: 0, isClean: false };
    expect(formatGitStatus(mockTheme as any, status)).toContain("++3|");
  });

  it("formats stashed", async () => {
    const { formatGitStatus } = await loadModule();
    const status = { ahead: 0, behind: 0, staged: 0, stashed: 1, conflicted: 0, isClean: false };
    expect(formatGitStatus(mockTheme as any, status)).toContain("*1|");
  });

  it("formats conflicted", async () => {
    const { formatGitStatus } = await loadModule();
    const status = { ahead: 0, behind: 0, staged: 0, stashed: 0, conflicted: 2, isClean: false };
    expect(formatGitStatus(mockTheme as any, status)).toContain("!!2|");
  });

  it("combines multiple statuses", async () => {
    const { formatGitStatus } = await loadModule();
    const status = { ahead: 1, behind: 0, staged: 2, stashed: 1, conflicted: 0, isClean: false };
    const result = formatGitStatus(mockTheme as any, status);
    expect(result).toContain("++2|");
    expect(result).toContain("*1|");
    expect(result).toContain("⇡1");
  });
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd pi-extensions/my-hud && npx vitest run index.test.ts`
Expected: All existing tests still pass + new `formatGitStatus` tests pass

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-hud/render.ts pi-extensions/my-hud/index.test.ts
git commit -m "feat(my-hud): add git status formatting to status line"
```

---

## Task 4: 修改 `bar.ts` — 异步缓存

**Files:**
- Modify: `pi-extensions/my-hud/bar.ts`
- Test: `pi-extensions/my-hud/index.test.ts`（追加 Bar 缓存测试）

- [ ] **Step 1: 修改 `bar.ts`**

```typescript
/**
 * aboveEditor widget bar — displays session stats (project, model, tokens, cost, git status).
 */

import type {
  ExtensionContext,
  ExtensionUIContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { basename } from "node:path";
import { aggregateSessionUsage } from "./session";
import { contextColored } from "./format";
import { buildStatusLine } from "./render";
import { getGitStatus } from "./git";
import type { GitStatus } from "./types";

const WIDGET_KEY = "my-hud-bar";
const GIT_STATUS_CACHE_TTL = 5000;

export class Bar {
  private uiCtx: ExtensionUIContext | undefined;
  private ctx: ExtensionContext | undefined;
  private tui: TUI | undefined;
  private branch: string | null = null;
  private gitStatus: GitStatus | null = null;
  private gitStatusCacheTime = 0;
  private gitStatusRefreshPending = false;

  setBranch(branch: string | null): void {
    this.branch = branch;
  }

  setContext(ctx: ExtensionContext): void {
    this.ctx = ctx;
  }

  setUICtx(ctx: ExtensionUIContext): void {
    if (ctx !== this.uiCtx) {
      this.uiCtx = ctx;
      this.tui = undefined;
    }
  }

  /** Register or refresh the widget. */
  update(): void {
    if (!this.uiCtx) return;

    this.uiCtx.setWidget(
      WIDGET_KEY,
      (tui, theme) => {
        this.tui = tui;
        return {
          render: (width: number) => this.renderWidget(theme, width),
          invalidate: () => {
            this.tui = undefined;
          },
        };
      },
      { placement: "aboveEditor" }
    );
  }

  requestRender(): void {
    this.tui?.requestRender();
  }

  /** Invalidate git status cache so next render triggers a fresh fetch. */
  invalidateGitStatus(): void {
    this.gitStatusCacheTime = 0;
  }

  private ensureGitStatus(): void {
    const now = Date.now();
    if (now - this.gitStatusCacheTime <= GIT_STATUS_CACHE_TTL) return;
    if (this.gitStatusRefreshPending) return;
    if (!this.ctx) return;

    this.gitStatusRefreshPending = true;
    getGitStatus(this.ctx.cwd)
      .then((status) => {
        this.gitStatus = status;
        this.gitStatusCacheTime = Date.now();
        this.requestRender();
      })
      .catch(() => {
        this.gitStatus = null;
        this.gitStatusCacheTime = Date.now();
      })
      .finally(() => {
        this.gitStatusRefreshPending = false;
      });
  }

  private renderWidget(theme: Theme, width: number): string[] {
    if (!this.ctx) return [];

    this.ensureGitStatus();

    const entries = this.ctx.sessionManager.getEntries();
    const usage = aggregateSessionUsage(entries);

    const cu = this.ctx.getContextUsage();
    const ctxColored = contextColored(
      theme,
      cu?.percent ?? null,
      cu?.contextWindow ?? null
    );

    const modelName = this.ctx.model?.id ?? "no-model";
    const project = basename(this.ctx.cwd);

    const line = buildStatusLine(theme, width, {
      project,
      modelName,
      branch: this.branch,
      ctxColored,
      usage,
      gitStatus: this.gitStatus,
    });
    return [line];
  }

  dispose(): void {
    if (this.uiCtx) {
      this.uiCtx.setWidget(WIDGET_KEY, undefined);
    }
    this.tui = undefined;
    this.uiCtx = undefined;
    this.ctx = undefined;
    this.branch = null;
    this.gitStatus = null;
    this.gitStatusCacheTime = 0;
    this.gitStatusRefreshPending = false;
  }
}
```

- [ ] **Step 2: 在 `index.test.ts` 追加 Bar git status 缓存测试**

在 `describe("Bar", ...)` 内部末尾追加：

```typescript
  it("triggers async git status refresh on first render", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    const setWidget = vi.fn();
    const requestRender = vi.fn();
    const theme = { fg: vi.fn((_c: string, text: string) => text) };
    const ctx = {
      cwd: "/x",
      model: { id: "m" },
      sessionManager: { getEntries: () => [] },
      getContextUsage: () => ({ percent: 0, contextWindow: 128000 }),
    };

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory({ requestRender }, theme);

    // First render triggers async refresh
    component.render(100);
    expect(requestRender).not.toHaveBeenCalled();

    // Wait for async refresh
    await new Promise((r) => setTimeout(r, 50));
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it("uses cached git status on subsequent renders within TTL", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    const setWidget = vi.fn();
    const requestRender = vi.fn();
    const theme = { fg: vi.fn((_c: string, text: string) => text) };
    const ctx = {
      cwd: "/x",
      model: { id: "m" },
      sessionManager: { getEntries: () => [] },
      getContextUsage: () => ({ percent: 0, contextWindow: 128000 }),
    };

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory({ requestRender }, theme);

    // First render triggers async fetch
    component.render(100);
    await new Promise((r) => setTimeout(r, 50));
    const callCountAfterFirst = requestRender.mock.calls.length;

    // Second render within TTL should not trigger another fetch
    requestRender.mockClear();
    component.render(100);
    await new Promise((r) => setTimeout(r, 50));
    expect(requestRender).not.toHaveBeenCalled();
  });

  it("invalidateGitStatus clears cache and triggers refresh on next render", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    const setWidget = vi.fn();
    const requestRender = vi.fn();
    const theme = { fg: vi.fn((_c: string, text: string) => text) };
    const ctx = {
      cwd: "/x",
      model: { id: "m" },
      sessionManager: { getEntries: () => [] },
      getContextUsage: () => ({ percent: 0, contextWindow: 128000 }),
    };

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory({ requestRender }, theme);

    // First render
    component.render(100);
    await new Promise((r) => setTimeout(r, 50));
    requestRender.mockClear();

    // Invalidate and render again
    bar.invalidateGitStatus();
    component.render(100);
    await new Promise((r) => setTimeout(r, 50));
    expect(requestRender).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cd pi-extensions/my-hud && npx vitest run index.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-hud/bar.ts pi-extensions/my-hud/index.test.ts
git commit -m "feat(my-hud): add git status caching to Bar widget"
```

---

## Task 5: 修改 `index.ts` — 事件驱动刷新

**Files:**
- Modify: `pi-extensions/my-hud/index.ts`

- [ ] **Step 1: 修改 `index.ts`**

在 `pi-extensions/my-hud/index.ts` 中进行以下修改：

1. `turn_start` handler 中，在 `requestRender()` 之前添加 `bar?.invalidateGitStatus()`：

```typescript
  pi.on("turn_start", (_event, ctx) => {
    const theme = ctx.ui.getTheme("catppuccin-mocha");
    const message = theme?.fg("accent", pickRandomMessage()) ?? pickRandomMessage();
    ctx.ui.setWorkingMessage(message);
    bar?.invalidateGitStatus();
    requestRender();
  });
```

2. `turn_end` handler 中，在 `requestRender()` 之前添加 `bar?.invalidateGitStatus()`：

```typescript
  pi.on("turn_end", () => {
    bar?.invalidateGitStatus();
    requestRender();
  });
```

3. `session_start` 的 `footerData.onBranchChange` callback 中，添加 `bar?.invalidateGitStatus()`：

```typescript
      const unsubBranch = footerData.onBranchChange(() => {
        bar?.setBranch(footerData.getGitBranch() ?? null);
        bar?.invalidateGitStatus();
        tui.requestRender();
      });
```

完整修改后的相关片段：

```typescript
  pi.on("turn_start", (_event, ctx) => {
    const theme = ctx.ui.getTheme("catppuccin-mocha");
    const message = theme?.fg("accent", pickRandomMessage()) ?? pickRandomMessage();
    ctx.ui.setWorkingMessage(message);
    bar?.invalidateGitStatus();
    requestRender();
  });

  pi.on("model_select", requestRender);
  pi.on("turn_end", () => {
    bar?.invalidateGitStatus();
    requestRender();
  });
```

以及：

```typescript
      const unsubBranch = footerData.onBranchChange(() => {
        bar?.setBranch(footerData.getGitBranch() ?? null);
        bar?.invalidateGitStatus();
        tui.requestRender();
      });
```

- [ ] **Step 2: 运行测试确认通过**

Run: `cd pi-extensions/my-hud && npx vitest run index.test.ts`
Expected: All tests PASS（现有事件注册测试不应被破坏，因为只是添加了没有副作用的 `invalidateGitStatus()` 调用）

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-hud/index.ts
git commit -m "feat(my-hud): wire up git status refresh on branch change and turn events"
```

---

## Task 6: 全量测试与覆盖率验证

**Files:**
- All modified files

- [ ] **Step 1: 运行全量测试**

Run: `cd pi-extensions/my-hud && npx vitest run --coverage`
Expected: All tests PASS，覆盖率达标（branches/functions/lines/statements ≥ 100%，排除 types.ts / index.ts）

- [ ] **Step 2: 修复任何测试失败或覆盖率缺口**

如果覆盖率不足：
- `git.ts`：增加边界情况测试（空字符串、异常格式、只有 worktree 修改无 staged 等）
- `render.ts`：测试 `formatGitStatus` 的 theme 颜色调用断言
- `bar.ts`：测试 `dispose` 后 `gitStatus` 字段被清空

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "test(my-hud): achieve full coverage for git status feature"
```

---

## Task 7: 部署验证

**Files:**
- N/A

- [ ] **Step 1: 部署扩展**

Run: `./install.sh`

- [ ] **Step 2: 启动 pi 验证**

启动 pi，在 git 仓库中执行操作，观察 aboveEditor bar 是否正确显示 git 状态：
1. 干净仓库 → 只显示分支名
2. `git add` 文件 → 显示 `++N|`
3. `git stash` → 显示 `*N|`
4. `git commit` 后领先远程 → 显示 `⇡N`
5. 切换到非 git 目录 → branch 字段消失

- [ ] **Step 3: Commit（如需要修复）**

如有修复，单独 commit：
```bash
git add pi-extensions/my-hud/
git commit -m "fix(my-hud): [描述具体问题]"
```

---

## Self-Review Checklist

### 1. Spec Coverage

| Spec 需求 | 对应 Task | 状态 |
|-----------|-----------|------|
| 展示 ahead/behind/diverged | Task 1 (parse), Task 3 (render) | ✅ |
| 展示 staged 数量 | Task 1 (parse), Task 3 (render) | ✅ |
| 展示 stashed 数量 | Task 1 (parse), Task 3 (render) | ✅ |
| 展示 conflicted 数量 | Task 1 (parse), Task 3 (render) | ✅ |
| 不展示 untracked/modified/deleted | Task 1 (parse 逻辑) | ✅ |
| 显示在 Branch 字段之后 | Task 3 (render.ts 逻辑) | ✅ |
| 5 秒 TTL 缓存 | Task 4 (bar.ts) | ✅ |
| 异步刷新不阻塞 TUI | Task 4 (ensureGitStatus 设计) | ✅ |
| branch_change / turn_start / turn_end 刷新 | Task 5 (index.ts) | ✅ |
| 不在 git 仓库时隐藏 | Task 1 (getGitStatus 返回 null), Task 3 (branch 条件渲染) | ✅ |

### 2. Placeholder Scan

- ✅ 无 TBD / TODO / "implement later"
- ✅ 所有测试代码完整，无 "Write tests for the above"
- ✅ 所有步骤包含具体代码和命令

### 3. Type Consistency

- ✅ `GitStatus` 接口在 `types.ts` 中定义，`git.ts` 和 `render.ts` 均从 `types.ts` 导入
- ✅ `StatusLineData.gitStatus` 类型为 `GitStatus | null | undefined`
- ✅ `formatGitStatus` 签名与 `buildStatusLine` 调用一致
- ✅ `Bar` 类中 `gitStatus` / `gitStatusCacheTime` / `gitStatusRefreshPending` 命名一致

### 4. 依赖方向检查

```
index.ts → bar.ts → render.ts → format.ts → icons.ts
         → git.ts  ────────┘
         → session.ts ──────┘
         → working.ts
```

- ✅ `git.ts` 不依赖 `render.ts` 或 `bar.ts`
- ✅ `render.ts` 使用 `git.ts` 的 `GitStatus` 类型（通过 `types.ts`）
- ✅ 无循环依赖
