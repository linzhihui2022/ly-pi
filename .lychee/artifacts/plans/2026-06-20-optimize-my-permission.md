# Optimize my-permission Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `my-permission` to enforce `read` (via glob path rules) and `bash` (via regex command rules) permissions, notify users of invalid config, and achieve 100% test coverage.

**Architecture:** Separate matching concerns (`picomatch` for paths, `RegExp` for bash) into `PermissionState`, extract shared UI prompting into a reusable helper, add a `BashPermission` handler parallel to `ReadPermission`, and wire both into the extension entry point.

## Global Constraints

- Test coverage must be 100% for branches/functions/lines/statements (excluded: `types.ts`, `index.ts`, `scripts/**`).
- Use `bun` for package management with `--registry https://registry.npmmirror.com`.
- Follow conventional commits: `type(scope): description` in English, imperative, lowercase, no trailing period.
- Match existing code style in `pi-extensions/my-permission`.
- Do not modify unrelated code.
- Do not delete pre-existing dead code.

**Tech Stack:** TypeScript, Bun, Vitest, picomatch, typebox, `@earendil-works/pi-coding-agent`.

---

## File Structure

| File | Responsibility |
|---|---|
| `pi-extensions/my-permission/types.ts` | TypeBox schemas, `PermissionConfig`, permission option labels. |
| `pi-extensions/my-permission/config.ts` | Load and validate `config.json`, notify on invalid config, fall back to defaults. |
| `pi-extensions/my-permission/state.ts` | Shared state, path glob matching, bash regex matching, action building. |
| `pi-extensions/my-permission/handler.ts` | Shared UI prompt flow for "ask" actions. |
| `pi-extensions/my-permission/read.ts` | `ReadPermission`: evaluate `read` tool calls against path rules. |
| `pi-extensions/my-permission/bash.ts` | `BashPermission`: evaluate `bash` tool calls against regex rules. |
| `pi-extensions/my-permission/index.ts` | Extension entry point: initialize state on `session_start`, dispatch `read`/`bash` on `tool_call`. |
| `pi-extensions/my-permission/package.json` | Add `picomatch` dependency. |
| `pi-extensions/my-permission/*.test.ts` | Vitest tests for each module. |

---

## Task 1: Add dependency and fix types

**Files:**
- Modify: `pi-extensions/my-permission/package.json`
- Modify: `pi-extensions/my-permission/types.ts`

**Interfaces:**
- Produces: `PermissionConfig`, `PermissionRuleItem`, `PermissionValueType`, `PERMISSION_OPTIONS`, `PermissionOption`.

- [ ] **Step 1: Add `picomatch` dependency**

  Modify `pi-extensions/my-permission/package.json`:

  ```json
  {
    "dependencies": {
      "@earendil-works/pi-coding-agent": "^0.78.0",
      "@earendil-works/pi-tui": "^0.78.0",
      "picomatch": "^4.0.2",
      "typebox": "^1.1.39"
    }
  }
  ```

- [ ] **Step 2: Install dependency**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure/pi-extensions/my-permission && bun install --registry https://registry.npmmirror.com
  ```

  Expected: `picomatch` appears in `node_modules/picomatch` and `package.json` lock is updated.

- [ ] **Step 3: Rewrite `types.ts`**

  Replace contents of `pi-extensions/my-permission/types.ts` with:

  ```ts
  import { Type, type Static } from "typebox";

  export const PermissionValue = Type.Union([
    Type.Literal("ask"),
    Type.Literal("deny"),
    Type.Literal("allow"),
  ]);

  export const PermissionRule = Type.Object({
    key: Type.String(),
    value: PermissionValue,
  });

  export const PermissionConfigSchema = Type.Object({
    permission: Type.Object({
      path: Type.Array(PermissionRule),
      bash: Type.Array(PermissionRule),
      tool: Type.Array(PermissionRule),
    }),
  });

  export type PermissionConfig = Static<typeof PermissionConfigSchema>;
  export type PermissionRuleItem = Static<typeof PermissionRule>;
  export type PermissionValueType = Static<typeof PermissionValue>;

  export const PERMISSION_OPTIONS = [
    "Allow once",
    "Allow for this session",
    "Deny once",
    "Deny for this session",
  ] as const;
  export type PermissionOption = (typeof PERMISSION_OPTIONS)[number];
  ```

- [ ] **Step 4: Verify types compile**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure/pi-extensions/my-permission && bun x tsc --noEmit
  ```

  Expected: No type errors.

---

## Task 2: Refactor state and matchers

**Files:**
- Modify: `pi-extensions/my-permission/state.ts`

**Interfaces:**
- Consumes: `PermissionConfig`, `PermissionRuleItem` from `types.ts`.
- Produces: `Action`, `PermissionState` with `matchPathRules`, `matchBashRules`, `buildAction`, `runtimeConfig`.

- [ ] **Step 1: Write failing state tests**

  Create `pi-extensions/my-permission/state.test.ts`:

  ```ts
  import { describe, expect, it, beforeEach } from "vitest";
  import { PermissionState } from "./state";
  import type { PermissionConfig } from "./types";

  describe("PermissionState", () => {
    let state: PermissionState;

    beforeEach(() => {
      state = new PermissionState();
      state.init({
        permission: {
          path: [
            { key: "/etc/*", value: "ask" },
            { key: "/etc/passwd", value: "deny" },
            { key: "*.env", value: "allow" },
          ],
          bash: [
            { key: "\\.env", value: "deny" },
            { key: "curl", value: "ask" },
          ],
          tool: [],
        },
      });
    });

    it("buildAction returns allow for allow rule", () => {
      expect(state.buildAction("config", { key: "*.env", value: "allow" })).toEqual({ action: "allow" });
    });

    it("buildAction returns deny for deny rule", () => {
      expect(state.buildAction("config", { key: "/etc/passwd", value: "deny" })).toEqual({
        action: "deny",
        rule: "/etc/passwd",
        from: "config",
      });
    });

    it("buildAction returns ask when no rule", () => {
      expect(state.buildAction("config")).toEqual({ action: "ask", rule: "default", from: "config" });
    });

    it("buildAction returns ask when rule value is ask", () => {
      expect(state.buildAction("config", { key: "/etc/*", value: "ask" })).toEqual({
        action: "ask",
        rule: "/etc/*",
        from: "config",
      });
    });

    it("matchPathRules uses glob and last match wins", () => {
      expect(state.matchPathRules("/etc/hosts")).toEqual({ key: "/etc/*", value: "ask" });
      expect(state.matchPathRules("/etc/passwd")).toEqual({ key: "/etc/passwd", value: "deny" });
      expect(state.matchPathRules("/etc")).toBeUndefined();
      expect(state.matchPathRules("app.env")).toEqual({ key: "*.env", value: "allow" });
      expect(state.matchPathRules("/nested/dir/config.env")).toBeUndefined();
    });

    it("matchPathRules supports ** for any depth", () => {
      state.config!.permission.path.push({ key: "**/*.env", value: "deny" });
      expect(state.matchPathRules("/nested/dir/config.env")).toEqual({ key: "**/*.env", value: "deny" });
    });

    it("matchBashRules uses regex and last match wins", () => {
      expect(state.matchBashRules("cat .env")).toEqual({ key: "\\.env", value: "deny" });
      expect(state.matchBashRules("grep secret .env")).toEqual({ key: "\\.env", value: "deny" });
      expect(state.matchBashRules("curl https://example.com")).toEqual({ key: "curl", value: "ask" });
      expect(state.matchBashRules("ls -la")).toBeUndefined();
    });

    it("matchBashRules returns undefined for invalid regex", () => {
      state.config!.permission.bash.push({ key: "[invalid", value: "deny" });
      expect(state.matchBashRules("anything")).toBeUndefined();
    });
  });
  ```

- [ ] **Step 2: Run state tests to verify they fail**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure/pi-extensions/my-permission && npx vitest run state.test.ts
  ```

  Expected: Tests fail because `matchPathRules` / `matchBashRules` do not exist.

- [ ] **Step 3: Implement `PermissionState`**

  Replace contents of `pi-extensions/my-permission/state.ts` with:

  ```ts
  import picomatch from "picomatch";
  import type { PermissionConfig, PermissionRuleItem } from "./types";

  export type ActionFrom = "config" | "runtime";

  export interface AskAction {
    action: "ask";
    rule: string;
    from: ActionFrom;
  }

  export interface DenyAction {
    action: "deny";
    rule: string;
    from: ActionFrom;
  }

  export interface AllowAction {
    action: "allow";
  }

  export type Action = AskAction | DenyAction | AllowAction;

  export class PermissionState {
    public config: PermissionConfig | null = null;
    public runtimeConfig: Pick<PermissionConfig["permission"], "path" | "bash"> = {
      path: [],
      bash: [],
    };

    init(config: PermissionConfig): void {
      this.config = config;
    }

    buildAction(from: ActionFrom, rule?: PermissionRuleItem): Action {
      if (rule?.value === "deny") {
        return { action: "deny", rule: rule.key, from };
      }
      if (rule?.value === "allow") {
        return { action: "allow" };
      }
      return { action: "ask", rule: rule?.key ?? "default", from };
    }

    matchPathRules(key: string, rules?: PermissionRuleItem[]): PermissionRuleItem | undefined {
      const targetRules = rules ?? this.config?.permission.path ?? [];
      const matches = targetRules.filter((rule) => picomatch.isMatch(key, rule.key));
      return matches.at(-1);
    }

    matchBashRules(command: string, rules?: PermissionRuleItem[]): PermissionRuleItem | undefined {
      const targetRules = rules ?? this.config?.permission.bash ?? [];
      const matches = targetRules.filter((rule) => {
        try {
          return new RegExp(rule.key).test(command);
        } catch {
          return false;
        }
      });
      return matches.at(-1);
    }
  }
  ```

- [ ] **Step 4: Run state tests to verify they pass**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure/pi-extensions/my-permission && npx vitest run state.test.ts
  ```

  Expected: All tests pass.

---

## Task 3: Extract shared UI prompt handler

**Files:**
- Create: `pi-extensions/my-permission/handler.ts`
- Create: `pi-extensions/my-permission/handler.test.ts`

**Interfaces:**
- Consumes: `ExtensionContext` from `@earendil-works/pi-coding-agent`, `PERMISSION_OPTIONS` from `types.ts`.
- Produces: `promptPermission(ctx, label, onAllowSession, onDenySession)` returning `Promise<{ block: true; reason: string } | undefined>`.

- [ ] **Step 1: Write failing handler tests**

  Create `pi-extensions/my-permission/handler.test.ts`:

  ```ts
  import { describe, expect, it, vi } from "vitest";
  import { promptPermission } from "./handler";
  import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

  function makeCtx(hasUI: boolean, choice?: string) {
    return {
      hasUI,
      ui: {
        select: vi.fn(async () => choice),
      },
    } as unknown as ExtensionContext;
  }

  describe("promptPermission", () => {
    it("blocks when UI is unavailable", async () => {
      const ctx = makeCtx(false);
      const result = await promptPermission(ctx, "read /etc/passwd", vi.fn(), vi.fn());
      expect(result).toEqual({ block: true, reason: 'Denied read /etc/passwd (no UI available for approval)' });
      expect(ctx.ui.select).not.toHaveBeenCalled();
    });

    it("returns undefined for Allow once", async () => {
      const ctx = makeCtx(true, "Allow once");
      const onAllow = vi.fn();
      const onDeny = vi.fn();
      const result = await promptPermission(ctx, "read /etc/passwd", onAllow, onDeny);
      expect(result).toBeUndefined();
      expect(onAllow).not.toHaveBeenCalled();
      expect(onDeny).not.toHaveBeenCalled();
    });

    it("calls onAllowSession for Allow for this session", async () => {
      const ctx = makeCtx(true, "Allow for this session");
      const onAllow = vi.fn();
      const onDeny = vi.fn();
      const result = await promptPermission(ctx, "read /etc/passwd", onAllow, onDeny);
      expect(result).toBeUndefined();
      expect(onAllow).toHaveBeenCalledTimes(1);
      expect(onDeny).not.toHaveBeenCalled();
    });

    it("blocks for Deny once", async () => {
      const ctx = makeCtx(true, "Deny once");
      const result = await promptPermission(ctx, "read /etc/passwd", vi.fn(), vi.fn());
      expect(result).toEqual({ block: true, reason: 'Denied read /etc/passwd by user (once)' });
    });

    it("calls onDenySession and blocks for Deny for this session", async () => {
      const ctx = makeCtx(true, "Deny for this session");
      const onAllow = vi.fn();
      const onDeny = vi.fn();
      const result = await promptPermission(ctx, "read /etc/passwd", onAllow, onDeny);
      expect(result).toEqual({ block: true, reason: 'Denied read /etc/passwd by user (session)' });
      expect(onAllow).not.toHaveBeenCalled();
      expect(onDeny).toHaveBeenCalledTimes(1);
    });

    it("blocks when user cancels", async () => {
      const ctx = makeCtx(true, undefined);
      const result = await promptPermission(ctx, "read /etc/passwd", vi.fn(), vi.fn());
      expect(result).toEqual({ block: true, reason: 'Denied read /etc/passwd (no choice made)' });
    });
  });
  ```

- [ ] **Step 2: Run handler tests to verify they fail**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure/pi-extensions/my-permission && npx vitest run handler.test.ts
  ```

  Expected: Tests fail because `handler.ts` does not exist.

- [ ] **Step 3: Implement `promptPermission`**

  Create `pi-extensions/my-permission/handler.ts`:

  ```ts
  import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
  import { PERMISSION_OPTIONS } from "./types";

  export async function promptPermission(
    ctx: ExtensionContext,
    label: string,
    onAllowSession: () => void,
    onDenySession: () => void,
  ): Promise<{ block: true; reason: string } | undefined> {
    if (!ctx.hasUI) {
      return { block: true, reason: `Denied ${label} (no UI available for approval)` };
    }
    const choice = await ctx.ui.select(`Allow ${label}?`, [...PERMISSION_OPTIONS]);
    switch (choice) {
      case PERMISSION_OPTIONS[0]:
        return undefined;
      case PERMISSION_OPTIONS[1]:
        onAllowSession();
        return undefined;
      case PERMISSION_OPTIONS[2]:
        return { block: true, reason: `Denied ${label} by user (once)` };
      case PERMISSION_OPTIONS[3]:
        onDenySession();
        return { block: true, reason: `Denied ${label} by user (session)` };
      default:
        return { block: true, reason: `Denied ${label} (no choice made)` };
    }
  }
  ```

- [ ] **Step 4: Run handler tests to verify they pass**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure/pi-extensions/my-permission && npx vitest run handler.test.ts
  ```

  Expected: All tests pass.

---

## Task 4: Refactor `ReadPermission`

**Files:**
- Modify: `pi-extensions/my-permission/read.ts`
- Create: `pi-extensions/my-permission/read.test.ts`

**Interfaces:**
- Consumes: `PermissionState`, `Action`, `promptPermission`.
- Produces: `ReadPermission` class with `check()` and `handleAction(action)`.

- [ ] **Step 1: Write failing read tests**

  Create `pi-extensions/my-permission/read.test.ts`:

  ```ts
  import { describe, expect, it, vi } from "vitest";
  import { ReadPermission } from "./read";
  import { PermissionState } from "./state";
  import type { ExtensionContext, ReadToolCallEvent } from "@earendil-works/pi-coding-agent";

  function makeEvent(path: string): ReadToolCallEvent {
    return {
      type: "tool_call",
      toolName: "read",
      input: { path },
      toolCallId: "tc-1",
    } as ReadToolCallEvent;
  }

  function makeCtx(hasUI: boolean, choice?: string): ExtensionContext {
    return {
      hasUI,
      ui: {
        select: vi.fn(async () => choice),
        notify: vi.fn(),
      },
      cwd: "/tmp",
    } as unknown as ExtensionContext;
  }

  function makeState(config?: any) {
    const state = new PermissionState();
    if (config) state.init(config);
    return state;
  }

  describe("ReadPermission.check", () => {
    it("returns ask when config is not loaded", () => {
      const perm = new ReadPermission(makeState(), makeEvent("/etc/passwd"), makeCtx(true));
      expect(perm.check()).toEqual({ action: "ask", rule: "default", from: "config" });
    });

    it("matches config path rules", () => {
      const state = makeState({
        permission: {
          path: [{ key: "/etc/passwd", value: "deny" }],
          bash: [],
          tool: [],
        },
      });
      const perm = new ReadPermission(state, makeEvent("/etc/passwd"), makeCtx(true));
      expect(perm.check()).toEqual({ action: "deny", rule: "/etc/passwd", from: "config" });
    });

    it("runtime allow overrides config deny", () => {
      const state = makeState({
        permission: {
          path: [{ key: "/etc/passwd", value: "deny" }],
          bash: [],
          tool: [],
        },
      });
      state.runtimeConfig.path.push({ key: "/etc/passwd", value: "allow" });
      const perm = new ReadPermission(state, makeEvent("/etc/passwd"), makeCtx(true));
      expect(perm.check()).toEqual({ action: "allow" });
    });

    it("falls back to config when runtime does not match", () => {
      const state = makeState({
        permission: {
          path: [{ key: "*.env", value: "deny" }],
          bash: [],
          tool: [],
        },
      });
      state.runtimeConfig.path.push({ key: "/etc/passwd", value: "allow" });
      const perm = new ReadPermission(state, makeEvent("secret.env"), makeCtx(true));
      expect(perm.check()).toEqual({ action: "deny", rule: "*.env", from: "config" });
    });
  });

  describe("ReadPermission.handleAction", () => {
    it("allow returns undefined", async () => {
      const perm = new ReadPermission(makeState(), makeEvent("/etc/passwd"), makeCtx(true));
      const result = await perm.handleAction({ action: "allow" });
      expect(result).toBeUndefined();
    });

    it("deny returns block with correct reason", async () => {
      const state = makeState({
        permission: {
          path: [{ key: "/etc/passwd", value: "deny" }],
          bash: [],
          tool: [],
        },
      });
      const perm = new ReadPermission(state, makeEvent("/etc/passwd"), makeCtx(true));
      const result = await perm.handleAction({ action: "deny", rule: "/etc/passwd", from: "config" });
      expect(result).toEqual({
        block: true,
        reason: 'Denied read /etc/passwd by rule "/etc/passwd" (config)',
      });
    });

    it("ask without UI blocks", async () => {
      const perm = new ReadPermission(makeState(), makeEvent("/etc/passwd"), makeCtx(false));
      const result = await perm.handleAction({ action: "ask", rule: "default", from: "config" });
      expect(result).toEqual({
        block: true,
        reason: "Denied read /etc/passwd (no UI available for approval)",
      });
    });

    it("ask allow once returns undefined", async () => {
      const ctx = makeCtx(true, "Allow once");
      const perm = new ReadPermission(makeState(), makeEvent("/etc/passwd"), ctx);
      const result = await perm.handleAction({ action: "ask", rule: "default", from: "config" });
      expect(result).toBeUndefined();
      expect(ctx.ui.select).toHaveBeenCalledWith("Allow read /etc/passwd?", [
        "Allow once",
        "Allow for this session",
        "Deny once",
        "Deny for this session",
      ]);
    });

    it("ask allow session stores runtime rule", async () => {
      const state = makeState();
      const ctx = makeCtx(true, "Allow for this session");
      const perm = new ReadPermission(state, makeEvent("/etc/passwd"), ctx);
      const result = await perm.handleAction({ action: "ask", rule: "default", from: "config" });
      expect(result).toBeUndefined();
      expect(state.runtimeConfig.path).toEqual([{ key: "/etc/passwd", value: "allow" }]);
    });

    it("ask deny once blocks without storing rule", async () => {
      const state = makeState();
      const ctx = makeCtx(true, "Deny once");
      const perm = new ReadPermission(state, makeEvent("/etc/passwd"), ctx);
      const result = await perm.handleAction({ action: "ask", rule: "default", from: "config" });
      expect(result).toEqual({ block: true, reason: "Denied read /etc/passwd by user (once)" });
      expect(state.runtimeConfig.path).toEqual([]);
    });

    it("ask deny session stores runtime deny rule", async () => {
      const state = makeState();
      const ctx = makeCtx(true, "Deny for this session");
      const perm = new ReadPermission(state, makeEvent("/etc/passwd"), ctx);
      const result = await perm.handleAction({ action: "ask", rule: "default", from: "config" });
      expect(result).toEqual({ block: true, reason: "Denied read /etc/passwd by user (session)" });
      expect(state.runtimeConfig.path).toEqual([{ key: "/etc/passwd", value: "deny" }]);
    });
  });
  ```

- [ ] **Step 2: Run read tests to verify they fail**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure/pi-extensions/my-permission && npx vitest run read.test.ts
  ```

  Expected: Tests fail because `read.ts` still uses old matcher API.

- [ ] **Step 3: Implement `ReadPermission`**

  Replace contents of `pi-extensions/my-permission/read.ts` with:

  ```ts
  import type { ReadToolCallEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
  import { PermissionState, type Action } from "./state";
  import { promptPermission } from "./handler";

  export class ReadPermission {
    constructor(
      public state: PermissionState,
      private event: ReadToolCallEvent,
      private ctx: ExtensionContext,
    ) {}

    check(): Action {
      if (!this.state.config) {
        return this.state.buildAction("config");
      }
      const path = this.event.input.path;
      const runtimeRule = this.state.matchPathRules(path, this.state.runtimeConfig.path);
      if (runtimeRule) {
        return this.state.buildAction("runtime", runtimeRule);
      }
      const configRule = this.state.matchPathRules(path, this.state.config.permission.path);
      return this.state.buildAction("config", configRule);
    }

    async handleAction(action: Action): Promise<{ block: true; reason: string } | undefined> {
      const label = `read ${this.event.input.path}`;
      switch (action.action) {
        case "allow":
          return undefined;
        case "deny":
          return {
            block: true,
            reason: `Denied ${label} by rule "${action.rule}" (${action.from})`,
          };
        case "ask":
          return promptPermission(this.ctx, label, () => {
            this.state.runtimeConfig.path.push({ key: this.event.input.path, value: "allow" });
          }, () => {
            this.state.runtimeConfig.path.push({ key: this.event.input.path, value: "deny" });
          });
      }
    }
  }
  ```

- [ ] **Step 4: Run read tests to verify they pass**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure/pi-extensions/my-permission && npx vitest run read.test.ts
  ```

  Expected: All tests pass.

---

## Task 5: Add `BashPermission`

**Files:**
- Create: `pi-extensions/my-permission/bash.ts`
- Create: `pi-extensions/my-permission/bash.test.ts`

**Interfaces:**
- Consumes: `PermissionState`, `Action`, `promptPermission`.
- Produces: `BashPermission` class with `check()` and `handleAction(action)`.

- [ ] **Step 1: Write failing bash tests**

  Create `pi-extensions/my-permission/bash.test.ts`:

  ```ts
  import { describe, expect, it, vi } from "vitest";
  import { BashPermission } from "./bash";
  import { PermissionState } from "./state";
  import type { ExtensionContext, BashToolCallEvent } from "@earendil-works/pi-coding-agent";

  function makeEvent(command: string): BashToolCallEvent {
    return {
      type: "tool_call",
      toolName: "bash",
      input: { command },
      toolCallId: "tc-1",
    } as BashToolCallEvent;
  }

  function makeCtx(hasUI: boolean, choice?: string): ExtensionContext {
    return {
      hasUI,
      ui: {
        select: vi.fn(async () => choice),
        notify: vi.fn(),
      },
      cwd: "/tmp",
    } as unknown as ExtensionContext;
  }

  function makeState(config?: any) {
    const state = new PermissionState();
    if (config) state.init(config);
    return state;
  }

  describe("BashPermission.check", () => {
    it("returns ask when config is not loaded", () => {
      const perm = new BashPermission(makeState(), makeEvent("cat .env"), makeCtx(true));
      expect(perm.check()).toEqual({ action: "ask", rule: "default", from: "config" });
    });

    it("matches config bash regex rules", () => {
      const state = makeState({
        permission: {
          path: [],
          bash: [{ key: "\\.env", value: "deny" }],
          tool: [],
        },
      });
      const perm = new BashPermission(state, makeEvent("cat .env"), makeCtx(true));
      expect(perm.check()).toEqual({ action: "deny", rule: "\\.env", from: "config" });
    });

    it("runtime allow overrides config deny", () => {
      const state = makeState({
        permission: {
          path: [],
          bash: [{ key: "\\.env", value: "deny" }],
          tool: [],
        },
      });
      state.runtimeConfig.bash.push({ key: "cat \\.env", value: "allow" });
      const perm = new BashPermission(state, makeEvent("cat .env"), makeCtx(true));
      expect(perm.check()).toEqual({ action: "allow" });
    });
  });

  describe("BashPermission.handleAction", () => {
    it("allow returns undefined", async () => {
      const perm = new BashPermission(makeState(), makeEvent("cat .env"), makeCtx(true));
      const result = await perm.handleAction({ action: "allow" });
      expect(result).toBeUndefined();
    });

    it("deny returns block with correct reason", async () => {
      const state = makeState({
        permission: {
          path: [],
          bash: [{ key: "\\.env", value: "deny" }],
          tool: [],
        },
      });
      const perm = new BashPermission(state, makeEvent("cat .env"), makeCtx(true));
      const result = await perm.handleAction({ action: "deny", rule: "\\.env", from: "config" });
      expect(result).toEqual({
        block: true,
        reason: 'Denied bash cat .env by rule "\\.env" (config)',
      });
    });

    it("ask allow session stores runtime rule", async () => {
      const state = makeState();
      const ctx = makeCtx(true, "Allow for this session");
      const perm = new BashPermission(state, makeEvent("curl example.com"), ctx);
      const result = await perm.handleAction({ action: "ask", rule: "default", from: "config" });
      expect(result).toBeUndefined();
      expect(state.runtimeConfig.bash).toEqual([{ key: "curl example.com", value: "allow" }]);
    });

    it("ask deny session stores runtime deny rule", async () => {
      const state = makeState();
      const ctx = makeCtx(true, "Deny for this session");
      const perm = new BashPermission(state, makeEvent("curl example.com"), ctx);
      const result = await perm.handleAction({ action: "ask", rule: "default", from: "config" });
      expect(result).toEqual({ block: true, reason: "Denied bash curl example.com by user (session)" });
      expect(state.runtimeConfig.bash).toEqual([{ key: "curl example.com", value: "deny" }]);
    });
  });
  ```

- [ ] **Step 2: Run bash tests to verify they fail**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure/pi-extensions/my-permission && npx vitest run bash.test.ts
  ```

  Expected: Tests fail because `bash.ts` does not exist.

- [ ] **Step 3: Implement `BashPermission`**

  Create `pi-extensions/my-permission/bash.ts`:

  ```ts
  import type { BashToolCallEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
  import { PermissionState, type Action } from "./state";
  import { promptPermission } from "./handler";

  export class BashPermission {
    constructor(
      public state: PermissionState,
      private event: BashToolCallEvent,
      private ctx: ExtensionContext,
    ) {}

    check(): Action {
      if (!this.state.config) {
        return this.state.buildAction("config");
      }
      const command = this.event.input.command;
      const runtimeRule = this.state.matchBashRules(command, this.state.runtimeConfig.bash);
      if (runtimeRule) {
        return this.state.buildAction("runtime", runtimeRule);
      }
      const configRule = this.state.matchBashRules(command, this.state.config.permission.bash);
      return this.state.buildAction("config", configRule);
    }

    async handleAction(action: Action): Promise<{ block: true; reason: string } | undefined> {
      const label = `bash ${this.event.input.command}`;
      switch (action.action) {
        case "allow":
          return undefined;
        case "deny":
          return {
            block: true,
            reason: `Denied ${label} by rule "${action.rule}" (${action.from})`,
          };
        case "ask":
          return promptPermission(this.ctx, label, () => {
            this.state.runtimeConfig.bash.push({ key: this.event.input.command, value: "allow" });
          }, () => {
            this.state.runtimeConfig.bash.push({ key: this.event.input.command, value: "deny" });
          });
      }
    }
  }
  ```

- [ ] **Step 4: Run bash tests to verify they pass**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure/pi-extensions/my-permission && npx vitest run bash.test.ts
  ```

  Expected: All tests pass.

---

## Task 6: Config loading with notification

**Files:**
- Modify: `pi-extensions/my-permission/config.ts`
- Create: `pi-extensions/my-permission/config.test.ts`

**Interfaces:**
- Consumes: `PermissionConfigSchema`, `PermissionConfig` from `types.ts`, `config.json`.
- Produces: `loadConfig(notify?)` returning `PermissionConfig`.

- [ ] **Step 1: Write failing config tests**

  Create `pi-extensions/my-permission/config.test.ts`:

  ```ts
  import { describe, expect, it, vi } from "vitest";
  import { loadConfig } from "./config";

  vi.mock("./config.json", () => ({
    default: {
      permission: {
        path: [{ key: "*.env", value: "deny" }],
        bash: [],
        tool: [],
      },
    },
  }));

  describe("loadConfig", () => {
    it("returns config when valid", () => {
      const notify = vi.fn();
      const config = loadConfig(notify);
      expect(config.permission.path).toEqual([{ key: "*.env", value: "deny" }]);
      expect(notify).not.toHaveBeenCalled();
    });
  });
  ```

  Create a second test file for invalid config by temporarily overriding the mock? Vitest `vi.mock` is hoisted, so use `vi.doMock` or test the invalid case by importing a dynamic version. Simpler: keep one test file and test only valid config here; invalid config behavior can be covered by mocking `config.json` differently in a separate `config-invalid.test.ts`, or by adding a helper in `config.ts` that accepts the raw config for testability.

  To keep coverage simple, refactor `config.ts` so the exported `loadConfig` accepts an optional `rawConfig` parameter for tests. Then tests can call `loadConfig(notify, rawInvalidConfig)`.

  Update the test to cover both:

  ```ts
  import { describe, expect, it, vi } from "vitest";
  import { loadConfig } from "./config";

  vi.mock("./config.json", () => ({
    default: {
      permission: {
        path: [{ key: "*.env", value: "deny" }],
        bash: [],
        tool: [],
      },
    },
  }));

  describe("loadConfig", () => {
    it("returns config.json when valid", () => {
      const notify = vi.fn();
      const config = loadConfig(notify);
      expect(config.permission.path).toEqual([{ key: "*.env", value: "deny" }]);
      expect(notify).not.toHaveBeenCalled();
    });

    it("notifies and returns default when raw config is invalid", () => {
      const notify = vi.fn();
      const invalid = { permission: { path: [{ key: 123, value: "deny" }] } } as any;
      const config = loadConfig(notify, invalid);
      expect(notify).toHaveBeenCalledWith(
        "Invalid my-permission config.json; using default permissions.",
        "error",
      );
      expect(config).toEqual({
        permission: { path: [], bash: [], tool: [] },
      });
    });

    it("does not throw when notify is omitted", () => {
      const invalid = { permission: { path: [{ key: 123, value: "deny" }] } } as any;
      expect(() => loadConfig(undefined, invalid)).not.toThrow();
    });
  });
  ```

- [ ] **Step 2: Run config tests to verify they fail**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure/pi-extensions/my-permission && npx vitest run config.test.ts
  ```

  Expected: Tests fail because `loadConfig` does not accept raw config parameter.

- [ ] **Step 3: Implement `config.ts`**

  Replace contents of `pi-extensions/my-permission/config.ts` with:

  ```ts
  import { type PermissionConfig, PermissionConfigSchema } from "./types";
  import { Check } from "typebox/value";
  import config from "./config.json";

  const defaultConfig: PermissionConfig = {
    permission: {
      bash: [],
      path: [],
      tool: [],
    },
  };

  export function loadConfig(
    notify?: (message: string, type?: "info" | "warning" | "error") => void,
    rawConfig: unknown = config,
  ): PermissionConfig {
    if (Check(PermissionConfigSchema, rawConfig)) {
      return rawConfig;
    }
    notify?.("Invalid my-permission config.json; using default permissions.", "error");
    return defaultConfig;
  }
  ```

- [ ] **Step 4: Run config tests to verify they pass**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure/pi-extensions/my-permission && npx vitest run config.test.ts
  ```

  Expected: All tests pass.

---

## Task 7: Wire extension entry point

**Files:**
- Modify: `pi-extensions/my-permission/index.ts`
- Create: `pi-extensions/my-permission/index.test.ts`

**Interfaces:**
- Consumes: `PermissionState`, `ReadPermission`, `BashPermission`, `loadConfig`.
- Produces: Extension factory `myPermission(pi)`.

- [ ] **Step 1: Write failing index tests**

  Create `pi-extensions/my-permission/index.test.ts`:

  ```ts
  import { describe, expect, it, vi, beforeEach } from "vitest";
  import myPermission from "./index";
  import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

  function makePi() {
    const handlers: Record<string, any> = {};
    return {
      on: vi.fn((event: string, handler: any) => {
        handlers[event] = handler;
      }),
      handlers,
    } as unknown as ExtensionAPI & { handlers: Record<string, any> };
  }

  function makeCtx(choice?: string) {
    return {
      hasUI: true,
      ui: {
        select: vi.fn(async () => choice),
        notify: vi.fn(),
      },
      cwd: "/tmp",
    };
  }

  describe("myPermission", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("registers session_start and tool_call handlers", () => {
      const pi = makePi();
      myPermission(pi);
      expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
      expect(pi.on).toHaveBeenCalledWith("tool_call", expect.any(Function));
    });

    it("intercepts read tool calls", async () => {
      const pi = makePi();
      myPermission(pi);
      const ctx = makeCtx("Deny once");
      const result = await pi.handlers.tool_call(
        { type: "tool_call", toolName: "read", input: { path: "/etc/passwd" }, toolCallId: "tc-1" },
        ctx,
      );
      expect(result).toEqual({ block: true, reason: "Denied read /etc/passwd by user (once)" });
    });

    it("intercepts bash tool calls", async () => {
      const pi = makePi();
      myPermission(pi);
      const ctx = makeCtx("Deny once");
      const result = await pi.handlers.tool_call(
        { type: "tool_call", toolName: "bash", input: { command: "cat .env" }, toolCallId: "tc-1" },
        ctx,
      );
      expect(result).toEqual({ block: true, reason: "Denied bash cat .env by user (once)" });
    });

    it("ignores other tool calls", async () => {
      const pi = makePi();
      myPermission(pi);
      const ctx = makeCtx();
      const result = await pi.handlers.tool_call(
        { type: "tool_call", toolName: "edit", input: { path: "/etc/passwd" }, toolCallId: "tc-1" },
        ctx,
      );
      expect(result).toBeUndefined();
    });
  });
  ```

- [ ] **Step 2: Run index tests to verify they fail**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure/pi-extensions/my-permission && npx vitest run index.test.ts
  ```

  Expected: Tests fail because `index.ts` does not dispatch bash or pass notify.

- [ ] **Step 3: Implement `index.ts`**

  Replace contents of `pi-extensions/my-permission/index.ts` with:

  ```ts
  import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
  import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
  import { PermissionState } from "./state";
  import { ReadPermission } from "./read";
  import { BashPermission } from "./bash";
  import { loadConfig } from "./config";

  export default function myPermission(pi: ExtensionAPI): void {
    const state = new PermissionState();
    pi.on("session_start", async (_event, ctx) => {
      state.init(loadConfig(ctx.ui.notify));
    });

    pi.on("tool_call", async (event, ctx) => {
      if (isToolCallEventType("read", event)) {
        const readPermission = new ReadPermission(state, event, ctx);
        return readPermission.handleAction(readPermission.check());
      }
      if (isToolCallEventType("bash", event)) {
        const bashPermission = new BashPermission(state, event, ctx);
        return bashPermission.handleAction(bashPermission.check());
      }
    });
  }
  ```

- [ ] **Step 4: Run index tests to verify they pass**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure/pi-extensions/my-permission && npx vitest run index.test.ts
  ```

  Expected: All tests pass.

---

## Task 8: Full test suite and coverage

**Files:**
- All existing and new test files.

- [ ] **Step 1: Run full test suite with coverage**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure/pi-extensions/my-permission && bun test
  ```

  Expected: All tests pass, coverage for branches/functions/lines/statements is 100%.

- [ ] **Step 2: Fix any coverage gaps**

  If coverage is below 100%, inspect the coverage report and add targeted tests. Common gaps:
  - `tool` rules branch in `PermissionConfigSchema` (already covered by valid config tests).
  - Default `defaultConfig` object (covered by invalid config test).
  - The `default` case in `promptPermission` (covered by cancel test).

- [ ] **Step 3: Run typecheck**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure/pi-extensions/my-permission && bun run typecheck
  ```

  Expected: No type errors.

- [ ] **Step 4: Run build**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure/pi-extensions/my-permission && bun run build
  ```

  Expected: Build succeeds and `dist/` contains the extension output.

- [ ] **Step 5: Run turbo test for the workspace**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure && bunx turbo run test --filter=my-permission
  ```

  Expected: All tests pass.

---

## Task 9: Deploy and verify

**Files:**
- None (deployment script).

- [ ] **Step 1: Deploy**

  Run:
  ```bash
  cd /Users/lychee/Documents/configure && bun run deploy
  ```

  Expected: Deployment completes without errors.

- [ ] **Step 2: Hot reload in Pi**

  In a Pi session, run `/reload`.

  Expected: Extension reloads without errors.

- [ ] **Step 3: Manual smoke test**

  In Pi, try:
  - `read /etc/passwd` with a `deny` rule → should be blocked.
  - `bash cat .env` with a `deny` rule → should be blocked.
  - `read some.env` with an `ask` rule → should show the four options.

  Expected: Behavior matches the configured rules.

---

## Self-Review

**Spec coverage:**
- [x] `read` path rules with glob matching (Tasks 2, 4).
- [x] `bash` command rules with regex matching (Tasks 2, 5).
- [x] Last-match-wins semantics (Task 2 tests).
- [x] Runtime session allow/deny (Tasks 4, 5 tests).
- [x] Four UI options with clear messages (Task 3 tests).
- [x] Config validation with user notification (Task 6).
- [x] 100% test coverage (Task 8).

**Placeholder scan:**
- No "TBD", "TODO", or vague instructions.
- Every step includes exact file paths, commands, and expected outputs.
- All code blocks are complete and runnable.

**Type consistency:**
- `PermissionState.runtimeConfig` uses `Pick<PermissionConfig["permission"], "path" | "bash">`.
- `loadConfig` accepts `notify` and optional `rawConfig`.
- `promptPermission` signature is consistent across `read.ts` and `bash.ts`.
- `Action` union is used consistently.
