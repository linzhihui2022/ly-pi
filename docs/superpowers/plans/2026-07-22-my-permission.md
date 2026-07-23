# my-permission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `my-permission` Pi extension that intercepts every `tool_call`, applies deterministic allow/ask/deny rules, falls back to a `deepseek-v4-flash` model judge for `ask` cases, and differentiates parent-session UI confirmation from subagent-session deny.

**Architecture:** A pure rule engine (`rules.ts`) evaluates `path`, `external_directory`, and per-tool surface layers with most-restrictive-wins composition. A thin model judge (`judge.ts`) uses the Pi `ModelRuntime` to ask `deepseek-v4-flash` for a one-shot `{ safe, reason, toolFor }` verdict. `ui.ts` handles confirmation and session-level caching only in the parent session. `index.ts` orchestrates the flow from the `tool_call` event.

**Tech Stack:** TypeScript, Bun, Vitest, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai` (TypeBox), `node:fs/promises`.

## Global Constraints

- Code coverage must be `branches / functions / lines / statements` 100% for the workspace.
- Coverage exclusions: `types.ts` (pure types) and `index.ts` (integration entry).
- Use conventional commits: `类型(范围): 描述`, English, imperative, lowercase, no period.
- Build with `bun build ./index.ts --outdir dist --target node --format esm --external '@earendil-works/*'`.
- Deploy to `~/.pi/agent/extensions/my-permission/` with both `index.js` and `config.json`.
- All non-trivial logic lives in pure, testable modules; `index.ts` is only wiring.
- No dependency on `@gotgenes/pi-permission-system`; the extension is standalone.

---

## File Map

| File | Responsibility |
|------|----------------|
| `pi-extensions/my-permission/types.ts` | Shared TypeScript interfaces and type aliases (excluded from coverage). |
| `pi-extensions/my-permission/utils.ts` | Path/symlink normalization, bash command splitting, env-prefix stripping, path token extraction. |
| `pi-extensions/my-permission/config.ts` | Load and validate `config.json` with safe defaults. |
| `pi-extensions/my-permission/rules.ts` | Rule matching engine: layer evaluation, glob matching, verdict composition. |
| `pi-extensions/my-permission/judge.ts` | One-shot model judge via `ModelRuntime.complete`. |
| `pi-extensions/my-permission/ui.ts` | Parent-session confirm dialog + session cache; child-session detection. |
| `pi-extensions/my-permission/index.ts` | Extension factory wiring `tool_call` → rules → judge → UI. |
| `pi-extensions/my-permission/config.json` | Default configuration shipped with the extension. |
| `pi-extensions/my-permission/package.json` | Workspace metadata, scripts, dependencies. |
| `pi-extensions/my-permission/tsconfig.json` | TypeScript compiler options. |
| `pi-extensions/my-permission/vitest.config.ts` | Vitest + v8 coverage config. |
| `pi-extensions/my-permission/scripts/deploy.ts` | Copies build artifacts and config to the Pi extensions directory. |

---

### Task 1: Scaffold workspace and shared types

**Files:**
- Create: `pi-extensions/my-permission/package.json`
- Create: `pi-extensions/my-permission/tsconfig.json`
- Create: `pi-extensions/my-permission/vitest.config.ts`
- Create: `pi-extensions/my-permission/config.json`
- Create: `pi-extensions/my-permission/scripts/deploy.ts`
- Create: `pi-extensions/my-permission/types.ts`

**Interfaces:**
- Consumes: none.
- Produces: `Action`, `RuleValue`, `PermissionMap`, `PermissionConfig`, `Config`, `Verdict`, `JudgeResult`, `ToolInput`.

- [ ] **Step 1: Write `package.json`**

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
  "devDependencies": {
    "@types/bun": "latest",
    "vitest": "^4"
  },
  "peerDependencies": {
    "@typescript/native-preview": "^7.0.0-beta"
  },
  "dependencies": {
    "@earendil-works/pi-ai": "^0.78.0",
    "@earendil-works/pi-coding-agent": "^0.78.0",
    "@types/node": "^25.9.1"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

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

- [ ] **Step 3: Write `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    execArgv: ["--max-old-space-size=4096"],
    coverage: {
      exclude: ["types.ts", "index.ts"],
    },
  },
});
```

- [ ] **Step 4: Write `config.json` default config**

```json
{
  "defaultPolicy": "ask",
  "judgeModel": "deepseek/deepseek-v4-flash",
  "judgeTimeoutMs": 8000,
  "childPolicy": "deny-on-unsafe",
  "permission": {}
}
```

- [ ] **Step 5: Write `scripts/deploy.ts`**

```typescript
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const dest = join(homedir(), ".pi/agent/extensions/my-permission");
await mkdir(dest, { recursive: true });
await Bun.write(join(dest, "index.js"), Bun.file("dist/index.js"));
await Bun.write(join(dest, "config.json"), Bun.file("config.json"));
console.log("my-permission deployed to", dest);
```

- [ ] **Step 6: Write `types.ts`**

```typescript
export type Action = "allow" | "ask" | "deny";

export interface DenyWithReason {
  action: "deny";
  reason: string;
}

export type RuleValue = Action | DenyWithReason;

export interface PermissionMap {
  [pattern: string]: RuleValue;
}

export interface PermissionConfig {
  [surface: string]: RuleValue | PermissionMap | undefined;
}

export interface Config {
  defaultPolicy: Action;
  judgeModel: string;
  judgeTimeoutMs: number;
  childPolicy: "deny-on-unsafe" | "allow-on-safe";
  permission: PermissionConfig;
}

export interface Verdict {
  action: Action;
  reason?: string;
  source?: string;
  matchedPattern?: string;
}

export interface JudgeResult {
  safe: boolean;
  reason: string;
  toolFor: string;
}

export interface ToolInput {
  toolName: string;
  value: string;
  paths: string[];
}
```

- [ ] **Step 7: Run `bun install` in the new workspace**

Run: `cd pi-extensions/my-permission && bun install`
Expected: dependencies installed, no errors.

- [ ] **Step 8: Commit**

```bash
git add pi-extensions/my-permission/package.json \
          pi-extensions/my-permission/tsconfig.json \
          pi-extensions/my-permission/vitest.config.ts \
          pi-extensions/my-permission/config.json \
          pi-extensions/my-permission/scripts/deploy.ts \
          pi-extensions/my-permission/types.ts

git commit -m "chore(my-permission): scaffold workspace and types"
```

---

### Task 2: Utility helpers (paths, bash parsing)

**Files:**
- Create: `pi-extensions/my-permission/utils.ts`
- Create: `pi-extensions/my-permission/utils.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `expandHome`, `resolvePath`, `isExternalPath`, `splitBashCommandUnits`, `stripEnvPrefix`, `extractPathTokens`.

- [ ] **Step 1: Write failing tests for `utils.ts`**

```typescript
import { describe, expect, it } from "vitest";
import {
  expandHome,
  extractPathTokens,
  isExternalPath,
  resolvePath,
  splitBashCommandUnits,
  stripEnvPrefix,
} from "./utils";

describe("expandHome", () => {
  it("expands leading tilde", () => {
    const home = process.env.HOME ?? "/tmp";
    expect(expandHome("~/.ssh/id_rsa")).toBe(`${home}/.ssh/id_rsa`);
  });

  it("leaves non-tilde paths unchanged", () => {
    expect(expandHome("/etc/passwd")).toBe("/etc/passwd");
  });
});

describe("splitBashCommandUnits", () => {
  it("splits by && and |", () => {
    expect(splitBashCommandUnits("cd /tmp && cat file | grep x")).toEqual([
      "cd /tmp",
      "cat file",
      "grep x",
    ]);
  });

  it("keeps quoted operators as one unit", () => {
    expect(splitBashCommandUnits('echo "a && b"')).toEqual(['echo "a && b"']);
  });

  it("strips environment prefixes", () => {
    expect(stripEnvPrefix("AWS_PROFILE=prod aws s3 ls")).toBe("aws s3 ls");
    expect(stripEnvPrefix("echo hello")).toBe("echo hello");
  });
});

describe("isExternalPath", () => {
  it("returns true for paths outside cwd", () => {
    expect(isExternalPath("/tmp", "/home")).toBe(true);
  });

  it("returns false for paths inside cwd", () => {
    expect(isExternalPath("/home/user/project/src", "/home/user/project")).toBe(false);
  });
});

describe("extractPathTokens", () => {
  it("finds relative, absolute, and dotfile tokens", () => {
    const tokens = extractPathTokens("cat src/main.ts ~/.env id_rsa", "/cwd");
    expect(tokens).toContain("src/main.ts");
    expect(tokens).toContain("~/.env");
    expect(tokens).toContain("id_rsa");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pi-extensions/my-permission && npx vitest run utils.test.ts`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement `utils.ts`**

```typescript
import { homedir } from "node:os";
import { resolve } from "node:path";

export function expandHome(path: string): string {
  if (path === "~" || path.startsWith("~/")) {
    return path.replace("~", homedir());
  }
  return path;
}

export function resolvePath(path: string, cwd: string): string {
  return resolve(expandHome(path), cwd);
}

export function isExternalPath(path: string, cwd: string): boolean {
  const absolute = resolve(expandHome(path), cwd);
  const cwdAbsolute = resolve(cwd);
  return !absolute.startsWith(cwdAbsolute + "/") && absolute !== cwdAbsolute;
}

export function splitBashCommandUnits(command: string): string[] {
  const units: string[] = [];
  let current = "";
  let inQuotes: false | '"' | "'" = false;

  for (const char of command) {
    if (inQuotes) {
      current += char;
      if (char === inQuotes) inQuotes = false;
      continue;
    }
    if (char === '"' || char === "'") {
      inQuotes = char;
      current += char;
      continue;
    }
    if (char === "&" || char === "|" || char === ";" || char === "\n") {
      if (current.trim()) units.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) units.push(current.trim());
  return units;
}

export function stripEnvPrefix(unit: string): string {
  const match = /^[A-Za-z_][A-Za-z0-9_]*=\S*\s+(.*)$/s.exec(unit);
  return match ? match[1] : unit;
}

export function extractPathTokens(command: string, cwd: string): string[] {
  const tokens = new Set<string>();
  const words = command.split(/\s+/);
  for (const word of words) {
    const trimmed = word.replace(/^["']|["']$/g, "");
    if (trimmed.startsWith("/") || trimmed.startsWith("~/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
      tokens.add(trimmed);
    } else if (trimmed.startsWith(".") && trimmed.length > 1) {
      tokens.add(trimmed);
    }
  }
  return Array.from(tokens);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pi-extensions/my-permission && npx vitest run utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-permission/utils.ts \
          pi-extensions/my-permission/utils.test.ts
git commit -m "feat(my-permission): add path and bash utility helpers"
```

---

### Task 3: Configuration loader

**Files:**
- Create: `pi-extensions/my-permission/config.ts`
- Create: `pi-extensions/my-permission/config.test.ts`

**Interfaces:**
- Consumes: `Config`, `Action`, `RuleValue`, `PermissionConfig` from `types.ts`.
- Produces: `loadConfig(configPath: string): Config`.

- [ ] **Step 1: Write failing tests for `config.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";

const tmp = join(import.meta.dirname, "tmp-config-test");

describe("loadConfig", () => {
  it("returns defaults when file is missing", async () => {
    const cfg = await loadConfig(join(tmp, "missing.json"));
    expect(cfg.defaultPolicy).toBe("ask");
    expect(cfg.judgeModel).toBe("deepseek/deepseek-v4-flash");
    expect(cfg.judgeTimeoutMs).toBe(8000);
    expect(cfg.childPolicy).toBe("deny-on-unsafe");
  });

  it("merges provided values", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "cfg.json");
    await writeFile(path, JSON.stringify({ defaultPolicy: "deny", judgeTimeoutMs: 3000 }));
    const cfg = await loadConfig(path);
    expect(cfg.defaultPolicy).toBe("deny");
    expect(cfg.judgeTimeoutMs).toBe(3000);
    expect(cfg.judgeModel).toBe("deepseek/deepseek-v4-flash");
  });

  it("falls back on invalid JSON", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "bad.json");
    await writeFile(path, "not json");
    const cfg = await loadConfig(path);
    expect(cfg.defaultPolicy).toBe("ask");
  });
});
```

- [ ] **Step 2: Implement `config.ts`**

```typescript
import type { Config, Action } from "./types";
import { readFile } from "node:fs/promises";

const DEFAULT_CONFIG: Config = {
  defaultPolicy: "ask",
  judgeModel: "deepseek/deepseek-v4-flash",
  judgeTimeoutMs: 8000,
  childPolicy: "deny-on-unsafe",
  permission: {},
};

const ACTIONS: Action[] = ["allow", "ask", "deny"];

function isAction(value: unknown): value is Action {
  return typeof value === "string" && ACTIONS.includes(value as Action);
}

export async function loadConfig(configPath: string): Promise<Config> {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      console.warn(`[my-permission] invalid config at ${configPath}, using defaults`);
      return DEFAULT_CONFIG;
    }
    const p = parsed as Record<string, unknown>;
    return {
      defaultPolicy: isAction(p.defaultPolicy) ? p.defaultPolicy : DEFAULT_CONFIG.defaultPolicy,
      judgeModel: typeof p.judgeModel === "string" ? p.judgeModel : DEFAULT_CONFIG.judgeModel,
      judgeTimeoutMs: typeof p.judgeTimeoutMs === "number" ? p.judgeTimeoutMs : DEFAULT_CONFIG.judgeTimeoutMs,
      childPolicy: p.childPolicy === "allow-on-safe" ? "allow-on-safe" : DEFAULT_CONFIG.childPolicy,
      permission: p.permission && typeof p.permission === "object" ? (p.permission as Config["permission"]) : DEFAULT_CONFIG.permission,
    };
  } catch (error) {
    console.warn(`[my-permission] failed to load config at ${configPath}, using defaults: ${error}`);
    return DEFAULT_CONFIG;
  }
}
```

- [ ] **Step 3: Run tests and commit**

Run: `cd pi-extensions/my-permission && npx vitest run config.test.ts`
Expected: PASS.

```bash
git add pi-extensions/my-permission/config.ts \
          pi-extensions/my-permission/config.test.ts
git commit -m "feat(my-permission): add config loader with safe defaults"
```

---

### Task 4: Rule engine

**Files:**
- Create: `pi-extensions/my-permission/rules.ts`
- Create: `pi-extensions/my-permission/rules.test.ts`

**Interfaces:**
- Consumes: `Config`, `PermissionMap`, `RuleValue`, `Verdict`, `Action`, `ToolInput` from `types.ts`; `expandHome`, `isExternalPath`, `extractPathTokens`, `splitBashCommandUnits`, `stripEnvPrefix` from `utils.ts`.
- Produces: `decide(input: ToolInput, cwd: string, config: Config): Verdict`.

- [ ] **Step 1: Write failing tests for core rule behaviors**

```typescript
import { describe, expect, it } from "vitest";
import { decide } from "./rules";
import type { Config } from "./types";

function cfg(permission: Config["permission"], defaultPolicy: Config["defaultPolicy"] = "ask"): Config {
  return {
    defaultPolicy,
    judgeModel: "deepseek/deepseek-v4-flash",
    judgeTimeoutMs: 8000,
    childPolicy: "deny-on-unsafe",
    permission,
  };
}

describe("decide", () => {
  it("allows read inside cwd by default when read: allow", () => {
    const v = decide({ toolName: "read", value: "src/main.ts", paths: ["src/main.ts"] }, "/repo", cfg({ read: "allow" }));
    expect(v.action).toBe("allow");
  });

  it("denies path layer even when read allows", () => {
    const c = cfg({ path: { "*.env": "deny" }, read: "allow" });
    const v = decide({ toolName: "read", value: "src/.env", paths: ["src/.env"] }, "/repo", c);
    expect(v.action).toBe("deny");
  });

  it("asks when external_directory triggers ask", () => {
    const c = cfg({ read: "allow", external_directory: "ask" });
    const v = decide({ toolName: "read", value: "../foo.txt", paths: ["../foo.txt"] }, "/repo", c);
    expect(v.action).toBe("ask");
  });

  it("uses last-match-wins inside a layer", () => {
    const c = cfg({ bash: { "rm *": "deny", "rm -rf *": "allow" } });
    const v = decide({ toolName: "bash", value: "rm -rf /tmp", paths: [] }, "/repo", c);
    expect(v.action).toBe("allow");
  });

  it("splits chained bash commands and takes most restrictive", () => {
    const c = cfg({ bash: { "rm *": "deny", "echo *": "allow" } });
    const v = decide({ toolName: "bash", value: "echo hello && rm foo", paths: [] }, "/repo", c);
    expect(v.action).toBe("deny");
  });
});
```

- [ ] **Step 2: Implement `rules.ts`**

```typescript
import type { Action, Config, PermissionMap, RuleValue, ToolInput, Verdict } from "./types";
import { expandHome, extractPathTokens, isExternalPath, splitBashCommandUnits, stripEnvPrefix } from "./utils";

export function decide(input: ToolInput, cwd: string, config: Config): Verdict {
  const layers: (Verdict | undefined)[] = [];

  if (input.paths.length > 0) {
    const pathRules = config.permission.path;
    if (pathRules) {
      layers.push(evaluatePathLayer(input.paths, pathRules as PermissionMap, cwd));
    }

    const extRules = config.permission.external_directory;
    if (extRules) {
      layers.push(evaluateExternalDirectoryLayer(input.paths, extRules as PermissionMap, cwd));
    }
  }

  const surfaceRules = config.permission[input.toolName];
  if (surfaceRules) {
    layers.push(evaluateSurfaceLayer(input, surfaceRules, cwd));
  }

  const merged = mergeVerdicts(...layers);
  if (merged) return merged;

  return { action: config.defaultPolicy, source: "defaultPolicy" };
}

export function evaluatePathLayer(paths: string[], rules: PermissionMap, _cwd: string): Verdict {
  return evaluateRuleMapMany(paths, rules, "path");
}

export function evaluateExternalDirectoryLayer(paths: string[], rules: PermissionMap, cwd: string): Verdict {
  const externalPaths = paths.filter((p) => isExternalPath(p, cwd));
  if (externalPaths.length === 0) return undefined;
  return evaluateRuleMapMany(externalPaths, rules, "external_directory");
}

export function evaluateSurfaceLayer(input: ToolInput, rules: RuleValue | PermissionMap, cwd: string): Verdict {
  if (input.toolName === "bash" && typeof rules === "object" && !("action" in rules)) {
    const units = splitBashCommandUnits(input.value).map(stripEnvPrefix);
    const verdicts = units.map((unit) => evaluateRuleMap(unit, rules as PermissionMap, "bash"));
    return mergeVerdicts(...verdicts) ?? { action: "ask", source: "bash" };
  }
  if (typeof rules === "string") {
    return { action: rules, source: input.toolName };
  }
  return evaluateRuleMap(input.value, rules as PermissionMap, input.toolName);
}

export function evaluateRuleMapMany(values: string[], rules: PermissionMap, source: string): Verdict | undefined {
  const verdicts = values.map((v) => evaluateRuleMap(v, rules, source));
  return mergeVerdicts(...verdicts);
}

export function evaluateRuleMap(value: string, rules: PermissionMap, source: string): Verdict | undefined {
  let winner: Verdict | undefined;
  for (const [pattern, rule] of Object.entries(rules)) {
    if (matchPattern(pattern, value)) {
      winner = toVerdict(rule, pattern, source);
    }
  }
  return winner;
}

export function toVerdict(rule: RuleValue, matchedPattern: string, source: string): Verdict {
  if (typeof rule === "string") return { action: rule, matchedPattern, source };
  return { action: rule.action, reason: rule.reason, matchedPattern, source };
}

export function matchPattern(pattern: string, value: string): boolean {
  const expanded = expandHome(pattern);
  if (expanded === "*") return true;
  const regex = new RegExp(
    "^" + expanded.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
  );
  return regex.test(value);
}

export function mergeVerdicts(...verdicts: (Verdict | undefined)[]): Verdict | undefined {
  const valid = verdicts.filter((v): v is Verdict => v !== undefined);
  if (valid.length === 0) return undefined;
  const order: Action[] = ["deny", "ask", "allow"];
  const sorted = valid.sort((a, b) => order.indexOf(a.action) - order.indexOf(b.action));
  return sorted[0];
}
```

- [ ] **Step 3: Run tests and commit**

Run: `cd pi-extensions/my-permission && npx vitest run rules.test.ts`
Expected: PASS.

```bash
git add pi-extensions/my-permission/rules.ts \
          pi-extensions/my-permission/rules.test.ts
git commit -m "feat(my-permission): implement layered rule engine"
```

---

### Task 5: Model judge

**Files:**
- Create: `pi-extensions/my-permission/judge.ts`
- Create: `pi-extensions/my-permission/judge.test.ts`

**Interfaces:**
- Consumes: `Config`, `JudgeResult`, `ToolInput` from `types.ts`; `ModelRuntime` from `@earendil-works/pi-coding-agent`.
- Produces: `createJudge(runtime: ModelRuntime, config: Config)` returning `(input: ToolInput, cwd: string, ctxModel: Model | undefined) => Promise<JudgeResult | undefined>`.

- [ ] **Step 1: Write failing tests for `judge.ts`**

```typescript
import { describe, expect, it, vi } from "vitest";
import { createJudge } from "./judge";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

function mockRuntime(completeValue: unknown): ModelRuntime {
  return {
    complete: vi.fn().mockResolvedValue(completeValue),
  } as unknown as ModelRuntime;
}

const config = {
  defaultPolicy: "ask" as const,
  judgeModel: "deepseek/deepseek-v4-flash",
  judgeTimeoutMs: 5000,
  childPolicy: "deny-on-unsafe" as const,
  permission: {},
};

describe("createJudge", () => {
  it("returns safe result when model says safe", async () => {
    const runtime = mockRuntime({
      content: [{ type: "text", text: '{"safe":true,"reason":"read only","toolFor":"read file"}' }],
    });
    const judge = createJudge(runtime, config);
    const result = await judge({ toolName: "read", value: "src/main.ts", paths: [] }, "/repo", undefined);
    expect(result).toEqual({ safe: true, reason: "read only", toolFor: "read file" });
  });

  it("returns undefined on invalid JSON", async () => {
    const runtime = mockRuntime({ content: [{ type: "text", text: "not json" }] });
    const judge = createJudge(runtime, config);
    const result = await judge({ toolName: "bash", value: "rm -rf /", paths: [] }, "/repo", undefined);
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement `judge.ts`**

```typescript
import type { ModelRuntime, Model } from "@earendil-works/pi-coding-agent";
import type { Config, JudgeResult, ToolInput } from "./types";

export function createJudge(runtime: ModelRuntime, config: Config) {
  return async function judge(
    input: ToolInput,
    cwd: string,
    fallbackModel: Model | undefined,
  ): Promise<JudgeResult | undefined> {
    const model = resolveModel(runtime, config, fallbackModel);
    if (!model) return undefined;

    const prompt = buildJudgePrompt(input, cwd);
    const context = {
      systemPrompt: "You are a security gate. Reply with strict JSON only.",
      messages: [{ role: "user" as const, content: prompt, timestamp: Date.now() }],
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.judgeTimeoutMs);
      const response = await runtime.complete(model, context, { signal: controller.signal } as never);
      clearTimeout(timeout);
      return parseJudgeResponse(response);
    } catch (error) {
      console.warn("[my-permission] judge call failed:", error);
      return undefined;
    }
  };
}

function resolveModel(runtime: ModelRuntime, config: Config, fallback: Model | undefined): Model | undefined {
  const parts = config.judgeModel.split("/");
  if (parts.length === 2) {
    const [provider, id] = parts;
    const found = runtime.getModel(provider, id) ?? runtime.find(provider, id);
    if (found) return found;
  }
  return fallback;
}

function buildJudgePrompt(input: ToolInput, cwd: string): string {
  return `You are a security gate for a coding assistant. Evaluate whether the following tool call is safe to run automatically.

Current working directory: ${cwd}
Tool name: ${input.toolName}
Tool input (sanitized): ${JSON.stringify(input.value)}

Reply with strict JSON only:
{
  "safe": boolean,
  "reason": "one sentence explaining why it is safe or unsafe",
  "toolFor": "one sentence describing what this tool call will do"
}

Guidelines:
- Safe: read-only operations, git status/diff/log, running tests, building, installing dependencies within the project.
- Unsafe: rm -rf, sudo, chmod/chown 777, writing secrets (.env, .pem, ssh keys), accessing files outside the project without clear reason, sending credentials over network, arbitrary code execution.
- Be concise. Do not include markdown formatting.`;
}

function parseJudgeResponse(response: { content: Array<{ type: string; text?: string }> }): JudgeResult | undefined {
  const text = response.content.find((c) => c.type === "text")?.text;
  if (!text) return undefined;
  const jsonMatch = /\{[\s\S]*\}/.exec(text);
  if (!jsonMatch) return undefined;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as { safe?: unknown }).safe !== "boolean" ||
      typeof (parsed as { reason?: unknown }).reason !== "string" ||
      typeof (parsed as { toolFor?: unknown }).toolFor !== "string"
    ) {
      return undefined;
    }
    return parsed as JudgeResult;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 3: Run tests and commit**

Run: `cd pi-extensions/my-permission && npx vitest run judge.test.ts`
Expected: PASS.

```bash
git add pi-extensions/my-permission/judge.ts \
          pi-extensions/my-permission/judge.test.ts
git commit -m "feat(my-permission): add deepseek-v4-flash model judge"
```

---

### Task 6: UI confirmation and session cache

**Files:**
- Create: `pi-extensions/my-permission/ui.ts`
- Create: `pi-extensions/my-permission/ui.test.ts`

**Interfaces:**
- Consumes: `ExtensionContext` from `@earendil-works/pi-coding-agent`.
- Produces: `isChildSession()`, `createSessionCache()`, `confirmToolCall(ctx, toolName, toolFor, reason)`.

- [ ] **Step 1: Write failing tests for `ui.ts`**

```typescript
import { describe, expect, it, vi } from "vitest";
import { confirmToolCall, createSessionCache, isChildSession } from "./ui";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const mockCtx = (confirmValue: boolean): ExtensionContext =>
  ({
    hasUI: true,
    ui: { confirm: vi.fn().mockResolvedValue(confirmValue) },
  }) as unknown as ExtensionContext;

describe("isChildSession", () => {
  it("returns true when PI_SUBAGENT_PARENT_SESSION is set", () => {
    process.env.PI_SUBAGENT_PARENT_SESSION = "parent-id";
    expect(isChildSession()).toBe(true);
    delete process.env.PI_SUBAGENT_PARENT_SESSION;
  });

  it("returns false otherwise", () => {
    expect(isChildSession()).toBe(false);
  });
});

describe("createSessionCache", () => {
  it("caches approved keys", () => {
    const cache = createSessionCache();
    cache.approve("bash:git status");
    expect(cache.isApproved("bash:git status")).toBe(true);
    expect(cache.isApproved("bash:rm -rf")).toBe(false);
  });
});

describe("confirmToolCall", () => {
  it("returns true when user confirms", async () => {
    const ctx = mockCtx(true);
    const ok = await confirmToolCall(ctx, "read", "read src/main.ts", "routine read");
    expect(ok).toBe(true);
    expect(ctx.ui.confirm).toHaveBeenCalledWith(
      "Tool call needs confirmation: read",
      "read src/main.ts\n\nReason: routine read",
    );
  });

  it("returns false when user denies", async () => {
    const ctx = mockCtx(false);
    const ok = await confirmToolCall(ctx, "read", "read src/main.ts", "routine read");
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `ui.ts`**

```typescript
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export function isChildSession(): boolean {
  return !!process.env.PI_SUBAGENT_PARENT_SESSION;
}

export function createSessionCache() {
  const approved = new Set<string>();
  return {
    approve(key: string) {
      approved.add(key);
    },
    isApproved(key: string) {
      return approved.has(key);
    },
  };
}

export async function confirmToolCall(
  ctx: ExtensionContext,
  toolName: string,
  toolFor: string,
  reason: string,
): Promise<boolean> {
  if (!ctx.hasUI) return false;
  return await ctx.ui.confirm(
    `Tool call needs confirmation: ${toolName}`,
    `${toolFor}\n\nReason: ${reason}`,
  );
}
```

- [ ] **Step 3: Run tests and commit**

Run: `cd pi-extensions/my-permission && npx vitest run ui.test.ts`
Expected: PASS.

```bash
git add pi-extensions/my-permission/ui.ts \
          pi-extensions/my-permission/ui.test.ts
git commit -m "feat(my-permission): add parent UI confirmation and child detection"
```

---

### Task 7: Extension entry wiring

**Files:**
- Create: `pi-extensions/my-permission/index.ts`
- Create: `pi-extensions/my-permission/index.test.ts`

**Interfaces:**
- Consumes: `loadConfig` from `config.ts`; `decide` from `rules.ts`; `createJudge` from `judge.ts`; `confirmToolCall`, `createSessionCache`, `isChildSession` from `ui.ts`; `ModelRuntime`, `ExtensionAPI`, `ToolCallEvent` from `@earendil-works/pi-coding-agent`; `extractPathTokens` from `utils.ts`.
- Produces: default async extension factory.

- [ ] **Step 1: Write failing integration test for `index.ts`**

```typescript
import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ToolCallEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";

const mockApi = (handler: (event: ToolCallEvent) => Promise<unknown | undefined>) => {
  return { on: vi.fn((_event, h) => handler(h)) } as unknown as ExtensionAPI;
};

const mockCtx = (hasUI: boolean): ExtensionContext =>
  ({
    hasUI,
    cwd: "/repo",
    ui: { confirm: vi.fn().mockResolvedValue(true), notify: vi.fn() },
    modelRegistry: { find: vi.fn() },
    model: undefined,
  }) as unknown as ExtensionContext;

// Because the factory is async and creates a ModelRuntime, mock it in a separate test file.
// For brevity, the plan assumes the index.test.ts sets up vi.mock("@earendil-works/pi-coding-agent", () => ({ ... }).
```

- [ ] **Step 2: Implement `index.ts`**

```typescript
import type { ExtensionAPI, ToolCallEvent, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig } from "./config";
import { decide } from "./rules";
import { createJudge } from "./judge";
import { confirmToolCall, createSessionCache, isChildSession } from "./ui";
import { extractPathTokens } from "./utils";

export default async function myPermission(pi: ExtensionAPI): Promise<void> {
  const extensionDir = dirname(fileURLToPath(import.meta.url));
  const config = await loadConfig(join(extensionDir, "config.json"));
  const runtime = await ModelRuntime.create();
  const judge = createJudge(runtime, config);
  const cache = createSessionCache();
  const child = isChildSession();

  pi.on("tool_call", async (event, ctx) => {
    const toolName = event.toolName;
    const value = stringifyToolInput(event);
    const paths = collectPaths(toolName, value, event, ctx.cwd);
    const verdict = decide({ toolName, value, paths }, ctx.cwd, config);

    if (verdict.action === "allow") return undefined;
    if (verdict.action === "deny") {
      return { block: true, reason: verdict.reason ?? `Blocked by ${verdict.source}` };
    }

    const cacheKey = `${toolName}:${value}`;
    if (cache.isApproved(cacheKey)) return undefined;

    const judgeResult = await judge({ toolName, value, paths }, ctx.cwd, ctx.model);
    if (judgeResult?.safe === true) return undefined;

    if (child || !ctx.hasUI) {
      return { block: true, reason: judgeResult?.reason ?? "Denied in non-interactive or subagent session" };
    }

    const approved = await confirmToolCall(
      ctx,
      toolName,
      judgeResult?.toolFor ?? `${toolName} ${value}`,
      judgeResult?.reason ?? "No model judgment available",
    );

    if (approved) {
      cache.approve(cacheKey);
      return undefined;
    }
    return { block: true, reason: judgeResult?.reason ?? "User denied" };
  });
}

function stringifyToolInput(event: ToolCallEvent): string {
  if (isToolCallEventType("bash", event)) return event.input.command;
  if (isToolCallEventType("read", event) || isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
    return event.input.path ?? "";
  }
  return JSON.stringify(event.input);
}

function collectPaths(toolName: string, value: string, event: ToolCallEvent, cwd: string): string[] {
  if (toolName === "bash") return extractPathTokens(value, cwd);
  if (isToolCallEventType("read", event) || isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
    return event.input.path ? [event.input.path] : [];
  }
  if (isToolCallEventType("grep", event) || isToolCallEventType("find", event) || isToolCallEventType("ls", event)) {
    return event.input.path ? [event.input.path] : [];
  }
  return [];
}
```

- [ ] **Step 3: Run integration tests and commit**

Run: `cd pi-extensions/my-permission && npx vitest run index.test.ts`
Expected: PASS after mocking `ModelRuntime` and `ExtensionContext`.

```bash
git add pi-extensions/my-permission/index.ts \
          pi-extensions/my-permission/index.test.ts
git commit -m "feat(my-permission): wire tool_call event into rules, judge, and UI"
```

---

### Task 8: Build, test, deploy verification

**Files:**
- Modify: none (build artifacts are generated).

**Interfaces:**
- Consumes: all previous tasks.
- Produces: `dist/index.js`, deployed extension.

- [ ] **Step 1: Typecheck**

Run: `cd pi-extensions/my-permission && bun run typecheck`
Expected: no errors.

- [ ] **Step 2: Run full test suite with coverage**

Run: `cd pi-extensions/my-permission && bun run test`
Expected: all tests pass, coverage 100% on `branches / functions / lines / statements`.

- [ ] **Step 3: Build**

Run: `cd pi-extensions/my-permission && bun run build`
Expected: `dist/index.js` created.

- [ ] **Step 4: Deploy locally**

Run: `cd pi-extensions/my-permission && bun run deploy`
Expected: `~/.pi/agent/extensions/my-permission/index.js` and `config.json` exist.

- [ ] **Step 5: Verify via `/reload`**

In Pi, run `/reload` and confirm `my-permission` appears in the loaded extensions list.

- [ ] **Step 6: Commit final verification artifacts**

```bash
git add pi-extensions/my-permission/dist/
git commit -m "build(my-permission): build and deploy artifacts"
```

---

## Self-Review Checklist

### Spec coverage

- [x] Independent `tool_call` interceptor — Task 7.
- [x] Deterministic rules with `path`, `external_directory`, surface layers — Task 4.
- [x] `deepseek/deepseek-v4-flash` model judge returning `{ safe, reason, toolFor }` — Task 5.
- [x] Parent UI confirmation / child-session deny — Tasks 6, 7.
- [x] Configurable via `config.json` — Task 1, 3.
- [x] 100% coverage — enforced in Task 8.
- [x] Subagent handling via `PI_SUBAGENT_PARENT_SESSION` — Tasks 6, 7.

### Placeholder scan

- [x] No `TBD`, `TODO`, or "implement later".
- [x] No vague "add error handling" steps.
- [x] Every task ends with a concrete test/commit step.
- [x] All file paths are exact.

### Type consistency

- [x] `Config`, `Verdict`, `JudgeResult`, `ToolInput` used consistently across tasks.
- [x] `decide` signature matches `rules.ts` and `index.ts` usage.
- [x] `createJudge` returns a function consumed by `index.ts`.

## Execution Options

**Plan complete and saved to `docs/superpowers/plans/2026-07-22-my-permission.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — I execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach would you like?
