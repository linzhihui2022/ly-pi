# my-permission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Pi extension that lets users ban specific tools via a runtime blacklist, persisted per session, with config-backed defaults.

**Architecture:** A small stateful extension with three focused modules: `config.ts` reads the JSON config, `state.ts` manages the deny list and distinguishes config vs runtime entries, and `index.ts` wires lifecycle events, commands, tool blocking, and LLM hints. Tests drive each module with mocked Pi APIs.

## Global Constraints

- TDD: write failing tests before implementation for every task.
- Coverage: branches/functions/lines/statements 100% (exclusions: `types.ts`, `index.ts`, `scripts/**`).
- Repository: Turborepo + Bun workspaces. Extension lives in `pi-extensions/my-permission/`; default config lives in `pi-config/my-permission.json`.
- Deployment: extension compiled to `dist/index.js` and copied to `~/.pi/agent/extensions/my-permission/index.js`; config copied to `~/.pi/agent/extensions/my-permission/config.json` via `pi-config/scripts/deploy.ts`.
- Language: UI notifications and command help text in Chinese; block reason returned to LLM in English.
- Matching: exact, case-sensitive tool-name matching only.
- Tool blocking: silent; do not notify the user when a tool is blocked.
- Session persistence: each `/permission` command appends a full snapshot `{ deny: [...] }` with `customType: "my-permission"`; restore uses the last such entry.
- Dependencies: reuse the same patterns as existing extensions (`my-ask`, `my-todo`, `my-bt`).

**Tech Stack:** TypeScript, Vitest, typebox, `@earendil-works/pi-coding-agent`, Bun.

---

## File Map

| File | Responsibility |
|---|---|
| `pi-config/my-permission.json` | Default deny list for the extension. |
| `pi-config/scripts/deploy.ts` | Copies `my-permission.json` to `~/.pi/agent/extensions/my-permission/config.json`. |
| `pi-extensions/my-permission/package.json` | Workspace package manifest with build/test/deploy scripts. |
| `pi-extensions/my-permission/tsconfig.json` | TypeScript config matching other extensions. |
| `pi-extensions/my-permission/vitest.config.ts` | Vitest config; excludes `types.ts`, `index.ts`, `scripts/**` from coverage. |
| `pi-extensions/my-permission/types.ts` | `PermissionConfig` schema and `PermissionState` interface. |
| `pi-extensions/my-permission/state.ts` | In-memory deny list state plus `fromConfig` / `fromEntries` factories and source annotation. |
| `pi-extensions/my-permission/config.ts` | Reads extension directory `config.json`, validates with typebox, falls back to empty deny list. |
| `pi-extensions/my-permission/index.ts` | Extension factory: event handlers, command registration, tool blocking, hidden LLM message. |
| `pi-extensions/my-permission/scripts/deploy.ts` | Copies `dist/index.js` to `~/.pi/agent/extensions/my-permission/index.js`. |
| `pi-extensions/my-permission/state.test.ts` | Unit tests for `PermissionState`. |
| `pi-extensions/my-permission/config.test.ts` | Unit tests for `loadConfig`. |
| `pi-extensions/my-permission/index.test.ts` | Integration tests for the extension factory. |

---

### Task 1: Create default config and update config deploy script

**Files:**
- Create: `pi-config/my-permission.json`
- Modify: `pi-config/scripts/deploy.ts`

**Interfaces:**
- Produces: `pi-config/my-permission.json` with shape `{ "deny": string[] }`.
- Produces: `pi-config/scripts/deploy.ts` that additionally deploys `my-permission.json` to `~/.pi/agent/extensions/my-permission/config.json`.

- [ ] **Step 1: Write default config**

Create `pi-config/my-permission.json`:

```json
{
  "deny": []
}
```

- [ ] **Step 2: Update deploy script**

Modify `pi-config/scripts/deploy.ts` to deploy the new config:

```typescript
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const configDest = join(homedir(), ".pi/agent/extensions/my-permission");
await mkdir(configDest, { recursive: true });
await Bun.write(join(configDest, "config.json"), Bun.file("my-permission.json"));

let dest = join(homedir(), ".pi/agent/extensions/pi-tool-display");
await mkdir(dest, { recursive: true });
await Bun.write(join(dest, "config.json"), Bun.file("pi-tool-display.json"));
```

- [ ] **Step 3: Commit**

```bash
git add pi-config/my-permission.json pi-config/scripts/deploy.ts
git commit -m "chore(pi-config): add my-permission default config and deploy step"
```

---

### Task 2: Scaffold the extension package

**Files:**
- Create: `pi-extensions/my-permission/package.json`
- Create: `pi-extensions/my-permission/tsconfig.json`
- Create: `pi-extensions/my-permission/vitest.config.ts`
- Create: `pi-extensions/my-permission/scripts/deploy.ts`

**Interfaces:**
- Produces: a runnable workspace package with build, test, and deploy scripts.

- [ ] **Step 1: Create package.json**

Create `pi-extensions/my-permission/package.json`:

```json
{
  "name": "my-permission",
  "module": "index.ts",
  "type": "module",
  "scripts": {
    "build": "bun build ./index.ts --outdir dist --target node --format esm --external '@earendil-works/*'",
    "typecheck": "bun x tsgo --noEmit",
    "test": "npx vitest run --coverage",
    "deploy": "bun run scripts/deploy.ts"
  },
  "dependencies": {
    "@earendil-works/pi-coding-agent": "^0.78.0",
    "typebox": "^1.1.39"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "vitest": "^4"
  },
  "peerDependencies": {
    "@typescript/native-preview": "^7.0.0-beta"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `pi-extensions/my-permission/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun", "node"]
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

Create `pi-extensions/my-permission/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    execArgv: ["--max-old-space-size=4096"],
    coverage: {
      exclude: ["types.ts", "index.ts", "scripts/**"],
    },
  },
});
```

- [ ] **Step 4: Create deploy script**

Create `pi-extensions/my-permission/scripts/deploy.ts`:

```typescript
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const dest = join(homedir(), ".pi/agent/extensions/my-permission");
await mkdir(dest, { recursive: true });
await Bun.write(join(dest, "index.js"), Bun.file("dist/index.js"));
```

- [ ] **Step 5: Install dependencies**

Run:

```bash
cd pi-extensions/my-permission && bun install
```

Expected: workspace dependencies installed, `node_modules/` created.

- [ ] **Step 6: Commit**

```bash
git add pi-extensions/my-permission/package.json pi-extensions/my-permission/tsconfig.json pi-extensions/my-permission/vitest.config.ts pi-extensions/my-permission/scripts/deploy.ts
git commit -m "chore(my-permission): scaffold extension package"
```

---

### Task 3: Define types

**Files:**
- Create: `pi-extensions/my-permission/types.ts`

**Interfaces:**
- Produces: `PermissionConfig` schema via typebox.
- Produces: `PermissionStateSnapshot` type used by `state.ts` and tests.

- [ ] **Step 1: Write the type definitions**

Create `pi-extensions/my-permission/types.ts`:

```typescript
import { Type, type Static } from "typebox";

export const PermissionConfigSchema = Type.Object(
  {
    deny: Type.Array(Type.String(), { default: [] }),
  },
  { additionalProperties: false },
);

export type PermissionConfig = Static<typeof PermissionConfigSchema>;

export type PermissionSource = "config" | "runtime";

export interface PermissionEntry {
  tool: string;
  source: PermissionSource;
}

export interface PermissionStateSnapshot {
  deny: string[];
}
```

- [ ] **Step 2: Commit**

```bash
git add pi-extensions/my-permission/types.ts
git commit -m "feat(my-permission): define config and state types"
```

---

### Task 4: Implement and test PermissionState

**Files:**
- Create: `pi-extensions/my-permission/state.ts`
- Create: `pi-extensions/my-permission/state.test.ts`

**Interfaces:**
- Consumes: `PermissionConfig`, `PermissionEntry`, `PermissionStateSnapshot` from `types.ts`.
- Produces: `PermissionState` class with `deny(tool)`, `allow(tool)`, `list()`, `reset()`, `snapshot()`, `fromConfig(config)`, `fromEntries(entries)`.

- [ ] **Step 1: Write failing tests**

Create `pi-extensions/my-permission/state.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { PermissionState } from "./state";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

describe("PermissionState", () => {
  it("creates empty state", () => {
    const state = new PermissionState();
    expect(state.list()).toEqual([]);
  });

  it("loads from config", () => {
    const state = PermissionState.fromConfig({ deny: ["edit", "write"] });
    expect(state.list()).toEqual([
      { tool: "edit", source: "config" },
      { tool: "write", source: "config" },
    ]);
  });

  it("denies a tool and marks it runtime", () => {
    const state = PermissionState.fromConfig({ deny: ["edit"] });
    state.deny("bash");
    expect(state.list()).toEqual([
      { tool: "edit", source: "config" },
      { tool: "bash", source: "runtime" },
    ]);
  });

  it("deny is idempotent", () => {
    const state = PermissionState.fromConfig({ deny: ["edit"] });
    state.deny("edit");
    expect(state.list()).toEqual([{ tool: "edit", source: "config" }]);
  });

  it("allow removes a runtime-denied tool", () => {
    const state = PermissionState.fromConfig({ deny: ["edit", "bash"] });
    state.deny("bash");
    state.allow("bash");
    expect(state.list()).toEqual([{ tool: "edit", source: "config" }]);
  });

  it("allow removes a config-denied tool", () => {
    const state = PermissionState.fromConfig({ deny: ["edit", "bash"] });
    state.allow("edit");
    expect(state.list()).toEqual([
      { tool: "bash", source: "config" },
      { tool: "edit", source: "runtime" },
    ]);
  });

  it("allow is idempotent", () => {
    const state = PermissionState.fromConfig({ deny: ["edit"] });
    state.allow("edit");
    state.allow("edit");
    expect(state.list()).toEqual([
      { tool: "edit", source: "runtime" },
    ]);
  });

  it("reset restores config defaults", () => {
    const state = PermissionState.fromConfig({ deny: ["edit"] });
    state.deny("bash");
    state.allow("edit");
    state.reset();
    expect(state.list()).toEqual([{ tool: "edit", source: "config" }]);
  });

  it("snapshot returns current deny list", () => {
    const state = PermissionState.fromConfig({ deny: ["edit"] });
    state.deny("bash");
    expect(state.snapshot()).toEqual({ deny: ["edit", "bash"] });
  });

  it("restores from session entries", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "my-permission",
        data: { deny: ["write", "bash"] },
      },
    ];
    const state = PermissionState.fromEntries(entries, { deny: ["edit"] });
    expect(state.list()).toEqual([
      { tool: "write", source: "runtime" },
      { tool: "bash", source: "runtime" },
    ]);
  });

  it("uses config when no matching entries", () => {
    const state = PermissionState.fromEntries([], { deny: ["edit"] });
    expect(state.list()).toEqual([{ tool: "edit", source: "config" }]);
  });

  it("uses latest matching entry", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "my-permission",
        data: { deny: ["write"] },
      },
      {
        type: "custom",
        customType: "other",
        data: { deny: ["bash"] },
      },
      {
        type: "custom",
        customType: "my-permission",
        data: { deny: ["bash"] },
      },
    ];
    const state = PermissionState.fromEntries(entries, { deny: ["edit"] });
    expect(state.list()).toEqual([{ tool: "bash", source: "runtime" }]);
  });

  it("ignores entries with invalid data shape", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "my-permission",
        data: { deny: "edit" },
      },
    ];
    const state = PermissionState.fromEntries(entries, { deny: ["edit"] });
    expect(state.list()).toEqual([{ tool: "edit", source: "config" }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd pi-extensions/my-permission && npx vitest run state.test.ts
```

Expected: FAIL — `PermissionState` not defined.

- [ ] **Step 3: Implement PermissionState**

Create `pi-extensions/my-permission/state.ts`:

```typescript
import type {
  PermissionConfig,
  PermissionEntry,
  PermissionStateSnapshot,
  PermissionSource,
} from "./types";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isValidSnapshot(value: unknown): value is PermissionStateSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return isStringArray(obj.deny);
}

export class PermissionState {
  private configDeny: string[] = [];
  private runtimeDeny: string[] | null = null;

  deny(tool: string): void {
    const current = this.effectiveDeny();
    if (current.includes(tool)) return;
    if (this.runtimeDeny === null) {
      this.runtimeDeny = [...current];
    }
    this.runtimeDeny.push(tool);
  }

  allow(tool: string): void {
    const current = this.effectiveDeny();
    if (!current.includes(tool)) return;
    if (this.runtimeDeny === null) {
      this.runtimeDeny = [...current];
    }
    this.runtimeDeny = this.runtimeDeny.filter((t) => t !== tool);
  }

  list(): PermissionEntry[] {
    const runtime = this.runtimeDeny;
    const config = this.configDeny;
    const tools = this.effectiveDeny();
    return tools.map((tool) => {
      const source: PermissionSource =
        runtime !== null && runtime.includes(tool)
          ? "runtime"
          : "config";
      return { tool, source };
    });
  }

  reset(): void {
    this.runtimeDeny = [];
  }

  snapshot(): PermissionStateSnapshot {
    return { deny: this.effectiveDeny() };
  }

  static fromConfig(config: PermissionConfig): PermissionState {
    const state = new PermissionState();
    state.configDeny = [...config.deny];
    return state;
  }

  static fromEntries(
    entries: SessionEntry[],
    config: PermissionConfig,
  ): PermissionState {
    const state = PermissionState.fromConfig(config);
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type !== "custom") continue;
      if (entry.customType !== "my-permission") continue;
      if (!isValidSnapshot(entry.data)) continue;
      state.runtimeDeny = [...entry.data.deny];
      break;
    }
    return state;
  }

  private effectiveDeny(): string[] {
    return this.runtimeDeny ?? this.configDeny;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd pi-extensions/my-permission && npx vitest run state.test.ts --coverage
```

Expected: PASS; coverage for `state.ts` 100%.

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-permission/state.ts pi-extensions/my-permission/state.test.ts
git commit -m "feat(my-permission): implement permission state management"
```

---

### Task 5: Implement and test config loading

**Files:**
- Create: `pi-extensions/my-permission/config.ts`
- Create: `pi-extensions/my-permission/config.test.ts`

**Interfaces:**
- Consumes: `PermissionConfigSchema` from `types.ts`.
- Produces: `loadConfig(configPath, notify?)` function returning `PermissionConfig`.
- Produces: `resolveConfigPath(override?)` returning the config path to read.

- [ ] **Step 1: Write failing tests**

Create `pi-extensions/my-permission/config.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { loadConfig } from "./config";

function tempDir() {
  const dir = join(tmpdir(), `my-permission-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("loadConfig", () => {
  it("loads valid config", () => {
    const dir = tempDir();
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ deny: ["edit", "bash"] }), "utf-8");
    expect(loadConfig(path)).toEqual({ deny: ["edit", "bash"] });
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty list when file missing", () => {
    expect(loadConfig("/nonexistent/my-permission/config.json")).toEqual({
      deny: [],
    });
  });

  it("resolves deployed config path when deployed file exists", () => {
    const deployed = join(homedir(), ".pi/agent/extensions/my-permission/config.json");
    const dir = dirname(deployed);
    mkdirSync(dir, { recursive: true });
    writeFileSync(deployed, JSON.stringify({ deny: ["bash"] }), "utf-8");
    expect(resolveConfigPath()).toBe(deployed);
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty list and notifies on invalid JSON", () => {
    const dir = tempDir();
    const path = join(dir, "config.json");
    const notify = vi.fn();
    writeFileSync(path, "not json", "utf-8");
    expect(loadConfig(path, notify)).toEqual({ deny: [] });
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("配置文件 JSON 解析失败"),
      "error",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty list and notifies on schema error", () => {
    const dir = tempDir();
    const path = join(dir, "config.json");
    const notify = vi.fn();
    writeFileSync(path, JSON.stringify({ deny: [1, 2] }), "utf-8");
    expect(loadConfig(path, notify)).toEqual({ deny: [] });
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("配置文件格式错误"),
      "error",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty list and notifies on extra properties", () => {
    const dir = tempDir();
    const path = join(dir, "config.json");
    const notify = vi.fn();
    writeFileSync(
      path,
      JSON.stringify({ deny: ["edit"], allow: ["bash"] }),
      "utf-8",
    );
    expect(loadConfig(path, notify)).toEqual({ deny: [] });
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("配置文件格式错误"),
      "error",
    );
    rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd pi-extensions/my-permission && npx vitest run config.test.ts
```

Expected: FAIL — `loadConfig` not defined.

- [ ] **Step 3: Implement config loader**

Create `pi-extensions/my-permission/config.ts`:

```typescript
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { Value } from "typebox";
import { PermissionConfigSchema, type PermissionConfig } from "./types";

export function resolveConfigPath(override?: string): string {
  if (override) return override;
  const deployed = join(homedir(), ".pi/agent/extensions/my-permission/config.json");
  if (existsSync(deployed)) return deployed;
  return new URL("./config.json", import.meta.url).pathname;
}

export function loadConfig(
  configPath: string,
  notify?: (message: string, level: "error") => void,
): PermissionConfig {
  if (!existsSync(configPath)) {
    return { deny: [] };
  }

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    return { deny: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message =
      err instanceof Error
        ? `配置文件 JSON 解析失败：${err.message}`
        : "配置文件 JSON 解析失败";
    notify?.(message, "error");
    return { deny: [] };
  }

  if (!Value.Check(PermissionConfigSchema, parsed)) {
    const errors = [...Value.Errors(PermissionConfigSchema, parsed)]
      .map((e) => `${e.path}: ${e.message}`)
      .join("; ");
    notify?.(`配置文件格式错误：${errors}`, "error");
    return { deny: [] };
  }

  return parsed as PermissionConfig;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd pi-extensions/my-permission && npx vitest run config.test.ts --coverage
```

Expected: PASS; coverage for `config.ts` 100%.

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-permission/config.ts pi-extensions/my-permission/config.test.ts
git commit -m "feat(my-permission): add config loader with typebox validation"
```

---

### Task 6: Implement and test the extension entry point

**Files:**
- Create: `pi-extensions/my-permission/index.ts`
- Create: `pi-extensions/my-permission/index.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `resolveConfigPath` from `config.ts`, `PermissionState` from `state.ts`.
- Produces: default export extension factory wired to `ExtensionAPI`.

- [ ] **Step 1: Write failing tests**

Create `pi-extensions/my-permission/index.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import myPermission from "./index";

interface Captured {
  handlers: Record<string, ((event: any, ctx: any) => any)[]>;
  commands: Record<string, any>;
  tools: any[];
  renderers: Record<string, any>;
  entries: any[];
}

function makeMockPi(entries: SessionEntry[] = []): ExtensionAPI {
  const captured: Captured = {
    handlers: {},
    commands: {},
    tools: [],
    renderers: {},
    entries: [],
  };

  return {
    on: vi.fn((event: string, handler: any) => {
      captured.handlers[event] = captured.handlers[event] ?? [];
      captured.handlers[event].push(handler);
    }),
    registerCommand: vi.fn((name: string, options: any) => {
      captured.commands[name] = options;
    }),
    registerTool: vi.fn((tool: any) => {
      captured.tools.push(tool);
    }),
    registerMessageRenderer: vi.fn((customType: string, renderer: any) => {
      captured.renderers[customType] = renderer;
    }),
    appendEntry: vi.fn((customType: string, data: any) => {
      captured.entries.push({ customType, data });
    }),
    getAllTools: vi.fn(() => [
      { name: "read" },
      { name: "edit" },
      { name: "write" },
      { name: "bash" },
    ]),
    __captured: captured,
  } as unknown as ExtensionAPI;
}

function makeCommandCtx(
  entries: SessionEntry[] = [],
): ExtensionCommandContext {
  return {
    hasUI: true,
    cwd: "/tmp",
    ui: {
      notify: vi.fn(),
    },
    sessionManager: {
      getEntries: vi.fn(() => entries),
    },
  } as unknown as ExtensionCommandContext;
}

function getHandler<T>(pi: ExtensionAPI, event: string): T {
  return (pi as any).__captured.handlers[event]?.[0] as T;
}

function getCommand(pi: ExtensionAPI, name: string): any {
  return (pi as any).__captured.commands[name];
}

function getAppended(pi: ExtensionAPI): { customType: string; data: any }[] {
  return (pi as any).__captured.entries;
}

describe("my-permission extension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers permission command", () => {
    const pi = makeMockPi();
    myPermission(pi);
    expect(getCommand(pi, "permission")).toBeDefined();
  });

  it("loads config and restores runtime entries on session_start", async () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "my-permission",
        data: { deny: ["bash"] },
      },
    ];
    const pi = makeMockPi(entries);
    myPermission(pi);
    const handler = getHandler<(e: any, ctx: any) => Promise<void>>(
      pi,
      "session_start",
    );
    const ctx = makeCommandCtx(entries);
    await handler?.({}, ctx);

    const toolHandler = getHandler<(e: any, ctx: any) => any>(pi, "tool_call");
    const block = await toolHandler?.({ toolName: "bash" }, ctx);
    expect(block).toEqual({
      block: true,
      reason: "Tool 'bash' is denied by my-permission",
    });
  });

  it("registers a message renderer for my-permission", () => {
    const pi = makeMockPi();
    myPermission(pi);
    expect((pi as any).__captured.renderers["my-permission"]).toBeDefined();
  });

  it("denies a tool via command", async () => {
    const pi = makeMockPi();
    myPermission(pi);
    const sessionHandler = getHandler<(e: any, ctx: any) => Promise<void>>(
      pi,
      "session_start",
    );
    const ctx = makeCommandCtx();
    await sessionHandler?.({}, ctx);

    const command = getCommand(pi, "permission");
    await command.handler("deny bash", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("已禁止 bash", "info");
    expect(getAppended(pi)).toEqual([{ customType: "my-permission", data: { deny: ["bash"] } }]);

    const toolHandler = getHandler<(e: any, ctx: any) => any>(pi, "tool_call");
    const block = await toolHandler?.({ toolName: "bash" }, ctx);
    expect(block).toEqual({
      block: true,
      reason: "Tool 'bash' is denied by my-permission",
    });
  });

  it("allows a tool via command", async () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "my-permission",
        data: { deny: ["bash"] },
      },
    ];
    const pi = makeMockPi(entries);
    myPermission(pi);
    const sessionHandler = getHandler<(e: any, ctx: any) => Promise<void>>(
      pi,
      "session_start",
    );
    const ctx = makeCommandCtx(entries);
    await sessionHandler?.({}, ctx);

    const command = getCommand(pi, "permission");
    await command.handler("allow bash", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("已恢复 bash", "info");
    expect(getAppended(pi)).toEqual([
      { customType: "my-permission", data: { deny: [] } },
    ]);
  });

  it("lists denied tools with sources", async () => {
    const pi = makeMockPi();
    myPermission(pi);
    const sessionHandler = getHandler<(e: any, ctx: any) => Promise<void>>(
      pi,
      "session_start",
    );
    const ctx = makeCommandCtx();
    await sessionHandler?.({}, ctx);

    const command = getCommand(pi, "permission");
    await command.handler("deny bash", ctx);
    await command.handler("list", ctx);

    expect(ctx.ui.notify).toHaveBeenLastCalledWith(
      "当前被禁工具：\nbash (runtime)",
      "info",
    );
  });

  it("resets to config defaults", async () => {
    const pi = makeMockPi();
    myPermission(pi);
    const sessionHandler = getHandler<(e: any, ctx: any) => Promise<void>>(
      pi,
      "session_start",
    );
    const ctx = makeCommandCtx();
    await sessionHandler?.({}, ctx);

    const command = getCommand(pi, "permission");
    await command.handler("deny bash", ctx);
    await command.handler("reset", ctx);

    expect(ctx.ui.notify).toHaveBeenLastCalledWith(
      "已恢复为配置文件默认值",
      "info",
    );
    expect(getAppended(pi)).toEqual([
      { customType: "my-permission", data: { deny: ["bash"] } },
      { customType: "my-permission", data: { deny: [] } },
    ]);
  });

  it("shows usage for unknown subcommand", async () => {
    const pi = makeMockPi();
    myPermission(pi);
    const command = getCommand(pi, "permission");
    const ctx = makeCommandCtx();
    await command.handler("foo", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "用法：/permission deny <tool> | allow <tool> | list | reset",
      "warning",
    );
  });

  it("shows usage for missing arguments", async () => {
    const pi = makeMockPi();
    myPermission(pi);
    const command = getCommand(pi, "permission");
    const ctx = makeCommandCtx();
    await command.handler("deny", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "用法：/permission deny <tool>",
      "warning",
    );
  });

  it("does not block allowed tools", async () => {
    const pi = makeMockPi();
    myPermission(pi);
    const sessionHandler = getHandler<(e: any, ctx: any) => Promise<void>>(
      pi,
      "session_start",
    );
    const ctx = makeCommandCtx();
    await sessionHandler?.({}, ctx);

    const toolHandler = getHandler<(e: any, ctx: any) => any>(pi, "tool_call");
    const block = await toolHandler?.({ toolName: "read" }, ctx);
    expect(block).toBeUndefined();
  });

  it("injects hidden message when deny list is non-empty", async () => {
    const pi = makeMockPi();
    myPermission(pi);
    const sessionHandler = getHandler<(e: any, ctx: any) => Promise<void>>(
      pi,
      "session_start",
    );
    const ctx = makeCommandCtx();
    await sessionHandler?.({}, ctx);

    const command = getCommand(pi, "permission");
    await command.handler("deny bash", ctx);

    const beforeHandler = getHandler<(e: any, ctx: any) => any>(
      pi,
      "before_agent_start",
    );
    const result = await beforeHandler?.({}, ctx);
    expect(result).toEqual({
      message: {
        customType: "my-permission",
        content:
          "The following tools are currently denied and cannot be used: bash.",
        display: false,
      },
    });
  });

  it("does not inject hidden message when deny list is empty", async () => {
    const pi = makeMockPi();
    myPermission(pi);
    const sessionHandler = getHandler<(e: any, ctx: any) => Promise<void>>(
      pi,
      "session_start",
    );
    const ctx = makeCommandCtx();
    await sessionHandler?.({}, ctx);

    const beforeHandler = getHandler<(e: any, ctx: any) => any>(
      pi,
      "before_agent_start",
    );
    const result = await beforeHandler?.({}, ctx);
    expect(result).toBeUndefined();
  });

  it("provides argument completions for deny and allow", () => {
    const pi = makeMockPi();
    myPermission(pi);
    const command = getCommand(pi, "permission");

    const completions = command.getArgumentCompletions?.("deny ");
    expect(completions).toContainEqual({
      value: "bash",
      label: "bash",
      description: "deny",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd pi-extensions/my-permission && npx vitest run index.test.ts
```

Expected: FAIL — `index.ts` not found / `myPermission` not defined.

- [ ] **Step 3: Implement the extension**

Create `pi-extensions/my-permission/index.ts`:

```typescript
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { loadConfig, resolveConfigPath } from "./config.js";
import { PermissionState } from "./state.js";
import type { PermissionStateSnapshot } from "./types.js";

const CONFIG_PATH = resolveConfigPath();

const USAGE =
  "用法：/permission deny <tool> | allow <tool> | list | reset";

function formatList(entries: { tool: string; source: string }[]): string {
  if (entries.length === 0) return "当前没有被禁工具。";
  const lines = entries.map((e) => `${e.tool} (${e.source})`);
  return `当前被禁工具：\n${lines.join("\n")}`;
}

export default function myPermission(pi: ExtensionAPI): void {
  let state = new PermissionState();

  function persist(): void {
    pi.appendEntry("my-permission", state.snapshot() as PermissionStateSnapshot);
  }

  pi.on("session_start", async (_event, ctx) => {
    const config = loadConfig(CONFIG_PATH, (message, level) => {
      ctx.ui.notify(message, level);
    });
    state = PermissionState.fromEntries(
      ctx.sessionManager.getEntries(),
      config,
    );
  });

  pi.on("tool_call", async (event, _ctx) => {
    const denied = state.list().map((e) => e.tool);
    if (denied.includes(event.toolName)) {
      return {
        block: true,
        reason: `Tool '${event.toolName}' is denied by my-permission`,
      };
    }
  });

  pi.on("before_agent_start", async (_event, _ctx) => {
    const denied = state.list().map((e) => e.tool);
    if (denied.length === 0) return;
    return {
      message: {
        customType: "my-permission",
        content: `The following tools are currently denied and cannot be used: ${denied.join(", ")}.`,
        display: false,
      },
    };
  });

  pi.registerMessageRenderer("my-permission", (_message, _options, theme) => {
    return new Text(theme.fg("dim", "[my-permission]"), 0, 0);
  });

  pi.registerCommand("permission", {
    description: "管理被禁工具：deny、allow、list、reset",
    getArgumentCompletions: (prefix: string) => {
      const trimmed = prefix.trimStart();
      const parts = trimmed.split(/\s+/);
      if (parts.length !== 2) return null;
      const sub = parts[0];
      if (sub !== "deny" && sub !== "allow") return null;
      const toolPrefix = parts[1] ?? "";
      const tools = pi
        .getAllTools()
        .map((t) => t.name)
        .filter((name) => name.startsWith(toolPrefix));
      return tools.map((name) => ({
        value: name,
        label: name,
        description: sub,
      }));
    },
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      const trimmed = (args ?? "").trim();
      const [sub, tool] = trimmed.split(/\s+/, 2);

      if (sub === "deny") {
        if (!tool) {
          ctx.ui.notify("用法：/permission deny <tool>", "warning");
          return;
        }
        state.deny(tool);
        persist();
        ctx.ui.notify(`已禁止 ${tool}`, "info");
        return;
      }

      if (sub === "allow") {
        if (!tool) {
          ctx.ui.notify("用法：/permission allow <tool>", "warning");
          return;
        }
        state.allow(tool);
        persist();
        ctx.ui.notify(`已恢复 ${tool}`, "info");
        return;
      }

      if (sub === "list") {
        ctx.ui.notify(formatList(state.list()), "info");
        return;
      }

      if (sub === "reset") {
        state.reset();
        persist();
        ctx.ui.notify("已恢复为配置文件默认值", "info");
        return;
      }

      ctx.ui.notify(USAGE, "warning");
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd pi-extensions/my-permission && npx vitest run index.test.ts --coverage
```

Expected: PASS; coverage of non-excluded files 100%.

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-permission/index.ts pi-extensions/my-permission/index.test.ts
git commit -m "feat(my-permission): implement extension entry point"
```

---

### Task 7: Run full test suite and build

**Files:**
- All files under `pi-extensions/my-permission/`

- [ ] **Step 1: Run extension tests**

```bash
cd pi-extensions/my-permission && bun test
```

Expected: all tests PASS; coverage branches/functions/lines/statements 100%.

- [ ] **Step 2: Build the extension**

```bash
cd pi-extensions/my-permission && bun run build
```

Expected: `dist/index.js` created without errors.

- [ ] **Step 3: Run workspace-wide tests**

```bash
bunx turbo run test
```

Expected: all workspace tests PASS.

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-permission/dist pi-extensions/my-permission/coverage
git commit -m "chore(my-permission): pass tests and build"
```

---

### Task 8: End-to-end deployment smoke test

**Files:**
- `pi-extensions/my-permission/scripts/deploy.ts`
- `pi-config/scripts/deploy.ts`

- [ ] **Step 1: Deploy the config**

```bash
cd pi-config && bun run scripts/deploy.ts
```

Verify:

```bash
ls ~/.pi/agent/extensions/my-permission/config.json && cat ~/.pi/agent/extensions/my-permission/config.json
```

Expected output:

```json
{
  "deny": []
}
```

- [ ] **Step 2: Deploy the extension**

```bash
cd pi-extensions/my-permission && bun run deploy
```

Verify:

```bash
ls ~/.pi/agent/extensions/my-permission/index.js
```

Expected: file exists.

- [ ] **Step 3: Run Pi with the extension (manual)**

```bash
pi -e ~/.pi/agent/extensions/my-permission/index.js
```

Inside Pi:

```
/permission deny bash
/permission list
# Then ask Pi to run a bash command; it should be blocked silently.
```

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore(my-permission): deployment smoke test"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|---|---|
| `pi-config/my-permission.json` default deny list | Task 1 |
| Runtime `/permission` command | Task 6 |
| `pi.appendEntry` full-snapshot persistence | Task 4, Task 6 |
| `tool_call` silent blocking | Task 6 |
| `before_agent_start` hidden LLM message | Task 6 |
| Chinese command feedback | Task 6 |
| Exact, case-sensitive matching | Task 4, Task 6 |
| No whitelist, no user_bash, no system prompt tool list, no arg filtering | Design / Task 6 |
| Config error handling with typebox | Task 5 |
| 100% coverage | All test tasks |

## Placeholder Scan

- No `TBD`, `TODO`, or vague steps remain.
- Every test step contains actual code.
- Every implementation step contains actual code.
- No "similar to Task N" references.

## Type Consistency Check

- `PermissionConfig` schema and type used consistently in `types.ts`, `config.ts`, `state.ts`.
- `PermissionStateSnapshot` shape `{ deny: string[] }` used by `state.ts`, `index.ts`, tests.
- `SessionEntry` from `@earendil-works/pi-coding-agent` used for entries in `state.ts` and tests.
- `PermissionEntry` `{ tool, source }` returned by `state.list()` and consumed by `index.ts`.
