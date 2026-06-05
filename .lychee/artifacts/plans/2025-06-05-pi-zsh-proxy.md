# Pi Zsh Proxy Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a Pi Extension that lets users execute zsh commands (with oh-my-zsh aliases) by prefixing with `$` or `$$`, routing through `zsh -ic`.

**Architecture:** Two-event interception: `input` event transforms `$cmd` → `!cmd` / `$$cmd` → `!!cmd`; `user_bash` event wraps execution in `zsh -ic`. Core logic isolated in `zsh-proxy.ts` for testability.

**Tech Stack:** TypeScript, Vitest, `@earendil-works/pi-coding-agent` APIs (`createLocalBashOperations`, event system)

---

## File Structure

```
pi-extensions/pi-zsh-proxy/
├── index.ts           # Extension entry point (glue code — coverage excluded)
├── index.test.ts      # Integration tests for event registration
├── zsh-proxy.ts       # Core logic: input transform + zsh operations wrapper
├── zsh-proxy.test.ts  # Unit tests for core logic (100% coverage required)
└── vitest.config.ts   # Test config matching existing extension pattern
```

**Coverage policy:** `vitest.config.ts` excludes `index.ts` and `types.ts` (project convention). `zsh-proxy.ts` must achieve 100% branches/functions/lines/statements coverage.

---

### Task 1: Create vitest.config.ts

**Files:**
- Create: `pi-extensions/pi-zsh-proxy/vitest.config.ts`

- [ ] **Step 1: Write config file**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["types.ts", "index.ts"],
    },
  },
});
```

- [ ] **Step 2: Verify file exists**

Run: `cat pi-extensions/pi-zsh-proxy/vitest.config.ts`
Expected: File content matches above.

---

### Task 2: Write failing tests for zsh-proxy.ts

**Files:**
- Create: `pi-extensions/pi-zsh-proxy/zsh-proxy.test.ts`

- [ ] **Step 1: Write test file**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExec = vi.fn();

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return {
    ...actual,
    createLocalBashOperations: vi.fn(() => ({ exec: mockExec })),
  };
});

import { transformInput, createZshOperations } from "./zsh-proxy";

describe("transformInput", () => {
  it("transforms $cmd to !cmd", () => {
    expect(transformInput("$gst")).toEqual({
      action: "transform",
      text: "!gst",
    });
  });

  it("transforms $$cmd to !!cmd", () => {
    expect(transformInput("$$gst")).toEqual({
      action: "transform",
      text: "!!gst",
    });
  });

  it("trims whitespace around $", () => {
    expect(transformInput("$ gst")).toEqual({
      action: "transform",
      text: "!gst",
    });
  });

  it("trims whitespace around $$", () => {
    expect(transformInput("$$  git status")).toEqual({
      action: "transform",
      text: "!!git status",
    });
  });

  it("continues for normal text", () => {
    expect(transformInput("hello world")).toEqual({
      action: "continue",
    });
  });

  it("continues for empty string", () => {
    expect(transformInput("")).toEqual({ action: "continue" });
  });

  it("handles $ with no command", () => {
    expect(transformInput("$")).toEqual({
      action: "transform",
      text: "!",
    });
  });

  it("handles $$ with no command", () => {
    expect(transformInput("$$")).toEqual({
      action: "transform",
      text: "!!",
    });
  });

  it("does not transform $ in the middle of text", () => {
    expect(transformInput("price is $5")).toEqual({
      action: "continue",
    });
  });
});

describe("createZshOperations", () => {
  beforeEach(() => {
    mockExec.mockClear();
  });

  it("wraps command with zsh -ic", async () => {
    mockExec.mockResolvedValue({
      output: "ok",
      exitCode: 0,
      cancelled: false,
      truncated: false,
    });
    const ops = createZshOperations();
    await ops.exec("gst", "/test");
    expect(mockExec).toHaveBeenCalledWith(
      'zsh -ic "gst"',
      "/test",
      undefined,
    );
  });

  it("wraps command with spaces", async () => {
    mockExec.mockResolvedValue({
      output: "ok",
      exitCode: 0,
      cancelled: false,
      truncated: false,
    });
    const ops = createZshOperations();
    await ops.exec("git status", "/test");
    expect(mockExec).toHaveBeenCalledWith(
      'zsh -ic "git status"',
      "/test",
      undefined,
    );
  });

  it("passes options through", async () => {
    mockExec.mockResolvedValue({
      output: "ok",
      exitCode: 0,
      cancelled: false,
      truncated: false,
    });
    const ops = createZshOperations();
    const options = { timeout: 30000 };
    await ops.exec("gst", "/test", options);
    expect(mockExec).toHaveBeenCalledWith(
      'zsh -ic "gst"',
      "/test",
      options,
    );
  });

  it("returns exec result", async () => {
    const result = {
      output: "mock output",
      exitCode: 0,
      cancelled: false,
      truncated: false,
    };
    mockExec.mockResolvedValue(result);
    const ops = createZshOperations();
    const actual = await ops.exec("gst", "/test");
    expect(actual).toBe(result);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /Users/lychee/Documents/configure
npx vitest run pi-extensions/pi-zsh-proxy/zsh-proxy.test.ts
```

Expected: FAIL with module not found or `transformInput is not a function`.

---

### Task 3: Implement zsh-proxy.ts

**Files:**
- Create: `pi-extensions/pi-zsh-proxy/zsh-proxy.ts`

- [ ] **Step 1: Write implementation**

```typescript
import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";

export interface TransformResult {
  action: "continue" | "transform";
  text?: string;
}

export function transformInput(text: string): TransformResult {
  const trimmed = text.trim();
  if (trimmed.startsWith("$$")) {
    const cmd = trimmed.slice(2).trim();
    return { action: "transform", text: `!!${cmd}` };
  }
  if (trimmed.startsWith("$")) {
    const cmd = trimmed.slice(1).trim();
    return { action: "transform", text: `!${cmd}` };
  }
  return { action: "continue" };
}

export function createZshOperations() {
  const local = createLocalBashOperations();
  return {
    exec(command: string, cwd: string, options?: any) {
      return local.exec(`zsh -ic ${JSON.stringify(command)}`, cwd, options);
    },
  };
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run:
```bash
npx vitest run pi-extensions/pi-zsh-proxy/zsh-proxy.test.ts
```

Expected: 13 tests PASS.

- [ ] **Step 3: Run coverage check**

Run:
```bash
npx vitest run pi-extensions/pi-zsh-proxy/zsh-proxy.test.ts --coverage
```

Expected: Coverage for `zsh-proxy.ts` shows 100% on branches, functions, lines, statements.

---

### Task 4: Write failing tests for index.ts

**Files:**
- Create: `pi-extensions/pi-zsh-proxy/index.test.ts`

- [ ] **Step 1: Write test file**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const registeredEvents = new Map<string, (...args: any[]) => any>();

const mockPi = {
  on: vi.fn((event: string, handler: (...args: any[]) => any) => {
    registeredEvents.set(event, handler);
  }),
};

async function loadModule() {
  return await import("./index");
}

describe("pi-zsh-proxy extension", () => {
  beforeEach(() => {
    registeredEvents.clear();
    mockPi.on.mockClear();
    vi.resetModules();
  });

  it("exports a default function", async () => {
    const mod = await loadModule();
    expect(typeof mod.default).toBe("function");
  });

  it("registers input handler", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredEvents.has("input")).toBe(true);
  });

  it("registers user_bash handler", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredEvents.has("user_bash")).toBe(true);
  });

  it("input handler delegates to transformInput for $cmd", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    const handler = registeredEvents.get("input");
    const result = await handler({ text: "$gst" });
    expect(result).toEqual({ action: "transform", text: "!gst" });
  });

  it("input handler returns continue for non-$ text", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    const handler = registeredEvents.get("input");
    const result = await handler({ text: "hello" });
    expect(result).toEqual({ action: "continue" });
  });

  it("input handler transforms $$cmd", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    const handler = registeredEvents.get("input");
    const result = await handler({ text: "$$gst" });
    expect(result).toEqual({ action: "transform", text: "!!gst" });
  });

  it("user_bash handler returns operations object", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    const handler = registeredEvents.get("user_bash");
    const result = handler(
      { command: "gst", excludeFromContext: false, cwd: "/test" },
      {} as any,
    );
    expect(result).toHaveProperty("operations");
    expect(typeof result.operations.exec).toBe("function");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run pi-extensions/pi-zsh-proxy/index.test.ts
```

Expected: FAIL with module not found or `default is not a function`.

---

### Task 5: Implement index.ts

**Files:**
- Create: `pi-extensions/pi-zsh-proxy/index.ts`

- [ ] **Step 1: Write implementation**

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { transformInput, createZshOperations } from "./zsh-proxy";

export default function piZshProxy(pi: ExtensionAPI): void {
  pi.on("input", async (event) => {
    const result = transformInput(event.text);
    if (result.action === "transform") {
      return result;
    }
    return { action: "continue" };
  });

  pi.on("user_bash", (_event, _ctx) => {
    return { operations: createZshOperations() };
  });
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run:
```bash
npx vitest run pi-extensions/pi-zsh-proxy/index.test.ts
```

Expected: 7 tests PASS.

---

### Task 6: Run full test suite with coverage

- [ ] **Step 1: Run all tests for the extension**

Run:
```bash
npx vitest run pi-extensions/pi-zsh-proxy/ --coverage
```

Expected:
- 20 tests total (13 + 7) PASS
- `zsh-proxy.ts`: 100% branches, functions, lines, statements
- `index.ts`: excluded from coverage (per vitest.config.ts)

---

### Task 7: Deploy and verify end-to-end

- [ ] **Step 1: Copy extension to Pi agent directory**

Run:
```bash
cp -r /Users/lychee/Documents/configure/pi-extensions/pi-zsh-proxy /Users/lychee/.pi/agent/extensions/
```

- [ ] **Step 2: Reload Pi**

In Pi interactive mode, run: `/reload`

- [ ] **Step 3: Verify `$gst` works**

In Pi editor, type: `$gst`

Expected:
- Command executes via zsh (shows `git status` output)
- Result is sent to LLM (appears in context)

- [ ] **Step 4: Verify `$$gst` works**

In Pi editor, type: `$$gst`

Expected:
- Command executes via zsh (shows `git status` output)
- Result is NOT sent to LLM (only displayed)

---

### Task 8: Commit

- [ ] **Step 1: Stage and commit**

Run:
```bash
cd /Users/lychee/Documents/configure
git add pi-extensions/pi-zsh-proxy/
git commit -m "feat(pi-zsh-proxy): add zsh proxy extension for $ and $$ commands"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ `$cmd` → `!cmd` (Task 3 + Task 5)
- ✅ `$$cmd` → `!!cmd` (Task 3 + Task 5)
- ✅ Trim whitespace around `$` / `$$` (Task 3 tests)
- ✅ `$` in middle of text ignored (Task 3 test)
- ✅ All commands via `zsh -ic` (Task 3 `createZshOperations`)
- ✅ Only `!` prefix (not LLM tool calls) — `user_bash` only intercepts user bash events

**2. Placeholder scan:**
- ✅ No TBD/TODO/fill in details
- ✅ Every step has exact file paths
- ✅ Every step has exact code blocks
- ✅ Every step has exact commands with expected output

**3. Type consistency:**
- ✅ `TransformResult` interface defined in Task 3, used consistently
- ✅ `transformInput` and `createZshOperations` signatures match between impl and tests
- ✅ Mock return types match actual exec result shape (`{ output, exitCode, cancelled, truncated }`)
