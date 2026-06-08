# Visual Companion Wait + Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `visual_companion_wait` tool that blocks until user confirms in browser, plus macOS `focusApp` activation on confirm.

**Architecture:** Extend `SessionManager` with a Promise-based resolver pattern: `waitForConfirm()` registers a resolver, `appendEvent()` calls it on `confirm` events. Focus is triggered via `execSync(osascript)` inside `appendEvent`.

**Tech Stack:** TypeScript, Vitest, Node.js `child_process.execSync`, macOS `osascript`

---

### File Map

| File | Role | Change |
|------|------|--------|
| `session.ts` | Core session lifecycle manager | Major — add wait resolver, focus logic |
| `session.test.ts` | Unit tests for SessionManager | Major — add wait/focus tests |
| `api.ts` | API layer between tools and SessionManager | Minor — add `wait()` method |
| `api.test.ts` | Unit tests for API | Minor — add `wait()` test |
| `tools.ts` | LLM tool definitions | Major — add `visual_companion_wait` tool |
| `tools.test.ts` | Unit tests for tools | Major — add wait tool test |
| `index.ts` | Extension entry point, registration | Minor — register new tool/command, pass focusApp |
| `index.test.ts` | Integration tests for extension | Minor — update tool/command counts |

---

### Task 1: SessionManager — add wait resolver + focus

**Files:**
- Modify: `pi-extensions/my-visual-companion/session.ts`
- Test: `pi-extensions/my-visual-companion/session.test.ts`

- [ ] **Step 1: Write the failing test (waitForConfirm basic)**

```typescript
it("waitForConfirm resolves when confirm event is appended", async () => {
  const manager = new SessionManager({ idleTimeoutMs: 30_000, focusApp: "WezTerm" });
  const mockServer = { close: vi.fn((cb) => cb?.()) } as any;
  const mockWss = { close: vi.fn(), clients: new Set() } as any;
  const session = manager.create(8080, "http://localhost:8080", mockServer, mockWss);

  const promise = manager.waitForConfirm(session.id, 5000);

  manager.appendEvent(session.id, { type: "confirm", text: "yes", timestamp: Date.now() });

  const event = await promise;
  expect(event.type).toBe("confirm");
  expect(event.text).toBe("yes");
});
```

Run: `cd pi-extensions/my-visual-companion && npx vitest run session.test.ts --reporter=verbose`
Expected: FAIL — `waitForConfirm is not a function`

- [ ] **Step 2: Write the failing test (waitForConfirm timeout)**

```typescript
it("waitForConfirm rejects on timeout", async () => {
  vi.useFakeTimers();
  const manager = new SessionManager({ idleTimeoutMs: 30_000, focusApp: "WezTerm" });
  const mockServer = { close: vi.fn((cb) => cb?.()) } as any;
  const mockWss = { close: vi.fn(), clients: new Set() } as any;
  const session = manager.create(8080, "http://localhost:8080", mockServer, mockWss);

  const promise = manager.waitForConfirm(session.id, 1000);
  vi.advanceTimersByTime(1500);

  await expect(promise).rejects.toThrow("Timeout waiting for confirm");
  vi.useRealTimers();
});
```

Run: same as above
Expected: FAIL — same reason

- [ ] **Step 3: Write the failing test (waitForConfirm with existing confirm)**

```typescript
it("waitForConfirm returns immediately if confirm already exists", async () => {
  const manager = new SessionManager({ idleTimeoutMs: 30_000, focusApp: "WezTerm" });
  const mockServer = { close: vi.fn((cb) => cb?.()) } as any;
  const mockWss = { close: vi.fn(), clients: new Set() } as any;
  const session = manager.create(8080, "http://localhost:8080", mockServer, mockWss);

  manager.appendEvent(session.id, { type: "confirm", text: "already", timestamp: Date.now() });

  const event = await manager.waitForConfirm(session.id, 5000);
  expect(event.text).toBe("already");
});
```

Run: same as above
Expected: FAIL

- [ ] **Step 4: Write the failing test (destroy rejects pending wait)**

```typescript
it("destroy rejects pending waitForConfirm", async () => {
  vi.useFakeTimers();
  const manager = new SessionManager({ idleTimeoutMs: 30_000, focusApp: "WezTerm" });
  const mockServer = { close: vi.fn((cb) => cb?.()) } as any;
  const mockWss = { close: vi.fn(), clients: new Set() } as any;
  const session = manager.create(8080, "http://localhost:8080", mockServer, mockWss);

  const promise = manager.waitForConfirm(session.id, 10_000);
  manager.destroy(session.id);

  await expect(promise).rejects.toThrow("Session destroyed");
  vi.useRealTimers();
});
```

Run: same as above
Expected: FAIL

- [ ] **Step 5: Implement SessionManager changes**

Modify `session.ts`:

```typescript
import { execSync } from "node:child_process";

export interface SessionManagerOptions {
  idleTimeoutMs: number;
  focusApp?: string;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private idleTimeoutMs: number;
  private focusApp?: string;
  private waitResolvers = new Map<string, { resolve: (event: CompanionEvent) => void; reject: (err: Error) => void }>();

  constructor(options: SessionManagerOptions) {
    this.idleTimeoutMs = options.idleTimeoutMs;
    this.focusApp = options.focusApp;
  }
  // ... existing methods ...

  waitForConfirm(id: string, timeoutMs: number): Promise<CompanionEvent> {
    return new Promise((resolve, reject) => {
      const session = this.sessions.get(id);
      if (!session) {
        reject(new Error("Session not found"));
        return;
      }
      const existing = session.events.find((e) => e.type === "confirm");
      if (existing) {
        resolve(existing);
        return;
      }
      this.waitResolvers.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.waitResolvers.has(id)) {
          this.waitResolvers.delete(id);
          reject(new Error("Timeout waiting for confirm"));
        }
      }, timeoutMs);
    });
  }

  appendEvent(id: string, event: CompanionEvent): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.events.push(event);
    session.lastActivity = Date.now();
    this.resetIdleTimer(id);

    if (event.type === "confirm") {
      const resolver = this.waitResolvers.get(id);
      if (resolver) {
        this.waitResolvers.delete(id);
        resolver.resolve(event);
      }
      this.focusApplication();
    }
  }

  destroy(id: string): void {
    const resolver = this.waitResolvers.get(id);
    if (resolver) {
      this.waitResolvers.delete(id);
      resolver.reject(new Error("Session destroyed"));
    }
    // ... rest of existing destroy logic ...
  }

  private focusApplication(): void {
    if (!this.focusApp) return;
    try {
      execSync(`osascript -e 'tell application "${this.focusApp}" to activate'`, { timeout: 5000 });
    } catch {
      // ignore focus failures
    }
  }
}
```

**Note:** `create()` and other methods stay unchanged. Only `constructor`, `waitForConfirm`, `appendEvent`, `destroy`, and `focusApplication` are new/modified.

Run: `npx vitest run session.test.ts --reporter=verbose`
Expected: PASS (all 14+ tests)

- [ ] **Step 6: Commit**

```bash
git add pi-extensions/my-visual-companion/session.ts pi-extensions/my-visual-companion/session.test.ts
git commit -m "feat(vc): add waitForConfirm and focusApplication to SessionManager"
```

---

### Task 2: API layer — add wait method

**Files:**
- Modify: `pi-extensions/my-visual-companion/api.ts`
- Test: `pi-extensions/my-visual-companion/api.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `api.test.ts`:

```typescript
it("wait returns confirm event", async () => {
  const { sessionId } = await api.start();
  manager.appendEvent(sessionId, { type: "confirm", text: "ok", timestamp: Date.now() });

  const event = await api.wait(sessionId, 5000);
  expect(event.type).toBe("confirm");
  expect(event.text).toBe("ok");
});
```

Run: `npx vitest run api.test.ts --reporter=verbose`
Expected: FAIL — `api.wait is not a function`

- [ ] **Step 2: Implement wait method**

Modify `api.ts`:

```typescript
async wait(sessionId: string, timeoutMs: number): Promise<CompanionEvent> {
  return manager.waitForConfirm(sessionId, timeoutMs);
},
```

Add inside the returned object, alongside `start`, `show`, `events`, `stop`.

Run: `npx vitest run api.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-visual-companion/api.ts pi-extensions/my-visual-companion/api.test.ts
git commit -m "feat(vc): add wait method to API"
```

---

### Task 3: Tools — add visual_companion_wait tool

**Files:**
- Modify: `pi-extensions/my-visual-companion/tools.ts`
- Test: `pi-extensions/my-visual-companion/tools.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tools.test.ts`:

```typescript
it("wait tool returns confirmed event", async () => {
  const startTool = tools.find((t) => t.name === "visual_companion_start")!;
  const waitTool = tools.find((t) => t.name === "visual_companion_wait")!;

  const startResult = await startTool.execute("tc-wait-1", {}, undefined, undefined, {} as any);
  const sessionId = startResult.details!.sessionId;

  // Simulate confirm by appending directly to manager
  manager.appendEvent(sessionId, { type: "confirm", text: "choice-a", timestamp: Date.now() });

  const result = await waitTool.execute("tc-wait-2", { session_id: sessionId, timeout_ms: 5000 }, undefined, undefined, {} as any);
  expect(result.details?.confirmed).toBe(true);
  expect(result.details?.event?.text).toBe("choice-a");
  expect(result.content[0].text).toContain("Confirmed: choice-a");
});
```

Run: `npx vitest run tools.test.ts --reporter=verbose`
Expected: FAIL — `visual_companion_wait` not found

- [ ] **Step 2: Implement the tool**

Modify `tools.ts` — add new tool to the returned array:

```typescript
defineTool({
  name: "visual_companion_wait",
  label: "Wait for Confirm",
  description: "Wait for user to confirm a selection in the Visual Companion browser. Blocks until confirmed or timeout. Only returns on confirm events (click alone does not resolve).",
  parameters: Type.Object({
    session_id: Type.String({ description: "Session ID from visual_companion_start" }),
    timeout_ms: Type.Number({ default: 300000, description: "Maximum time to wait in milliseconds. Default 5 minutes." }),
  }),
  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    try {
      const event = await api.wait(params.session_id, params.timeout_ms);
      return {
        content: [{ type: "text" as const, text: `Confirmed: ${event.text || event.choice || "selection"}` }],
        details: { confirmed: true, event },
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        details: { error: err.message },
      };
    }
  },
}),
```

Run: `npx vitest run tools.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-visual-companion/tools.ts pi-extensions/my-visual-companion/tools.test.ts
git commit -m "feat(vc): add visual_companion_wait tool"
```

---

### Task 4: Index — register new tool/command, pass focusApp

**Files:**
- Modify: `pi-extensions/my-visual-companion/index.ts`
- Test: `pi-extensions/my-visual-companion/index.test.ts`

- [ ] **Step 1: Write the failing test updates**

Modify `index.test.ts`:

```typescript
it("registers 5 LLM tools", async () => {
  const mod = await loadModule();
  mod.default(mockPi as any);
  expect(registeredTools.length).toBe(5);
  const names = registeredTools.map((t) => t.name);
  expect(names).toContain("visual_companion_start");
  expect(names).toContain("visual_companion_show");
  expect(names).toContain("visual_companion_read_events");
  expect(names).toContain("visual_companion_stop");
  expect(names).toContain("visual_companion_wait");
});

it("registers 5 slash commands", async () => {
  const mod = await loadModule();
  mod.default(mockPi as any);
  expect(registeredCommands.has("vc-start")).toBe(true);
  expect(registeredCommands.has("vc-show")).toBe(true);
  expect(registeredCommands.has("vc-events")).toBe(true);
  expect(registeredCommands.has("vc-stop")).toBe(true);
  expect(registeredCommands.has("vc-wait")).toBe(true);
});
```

Run: `npx vitest run index.test.ts --reporter=verbose`
Expected: FAIL — tool/command count mismatch, `vc-wait` missing

- [ ] **Step 2: Implement index.ts changes**

Modify `index.ts`:

```typescript
const manager = new SessionManager({ idleTimeoutMs, focusApp: config.focusApp });
```

Add new tool registration loop (already loops over `tools`, so just adding the tool to `tools.ts` is enough).

Add new slash command:

```typescript
pi.registerCommand("vc-wait", {
  description: "Wait for user confirmation in Visual Companion (args: session_id)",
  handler: async (args, ctx: ExtensionContext) => {
    const sessionId = args?.trim() || "";
    if (!sessionId) {
      ctx.ui.notify("Usage: /vc-wait <session_id>", "warning");
      return;
    }
    const tool = tools.find((t) => t.name === "visual_companion_wait")!;
    const result = await tool.execute("cmd-wait", { session_id: sessionId, timeout_ms: 300000 }, undefined, undefined, ctx);
    ctx.ui.notify(result.content.map((c) => c.text).join("\n"), result.details?.error ? "error" : "info");
  },
});
```

Run: `npx vitest run index.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-visual-companion/index.ts pi-extensions/my-visual-companion/index.test.ts
git commit -m "feat(vc): register wait tool and command, pass focusApp to SessionManager"
```

---

### Task 5: Full test run + coverage check

- [ ] **Step 1: Run all tests**

```bash
cd pi-extensions/my-visual-companion && npx vitest run --reporter=verbose
```

Expected: All tests pass (48+ tests across 5 files)

- [ ] **Step 2: Check coverage**

```bash
cd pi-extensions/my-visual-companion && npx vitest run --coverage
```

Expected: branches/functions/lines/statements all at 100% (or close, excluding types.ts/index.ts as per existing exclusions)

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "test(vc): full coverage for wait and focus features"
```

---

### Self-Review Checklist

1. **Spec coverage:**
   - [x] `visual_companion_wait` tool → Task 3
   - [x] Promise-based blocking wait → Task 1 (waitForConfirm)
   - [x] Only waits for confirm (not click) → Task 3 description
   - [x] macOS focusApp via osascript → Task 1 (focusApplication)
   - [x] Timeout handling → Task 1 Step 2
   - [x] Race condition (confirm before wait) → Task 1 Step 3
   - [x] Destroy cleanup → Task 1 Step 4
   - [x] URL in vc-show response → already implemented (previous commit)

2. **Placeholder scan:** No TBD, TODO, or vague steps found.

3. **Type consistency:** `waitForConfirm(id, timeoutMs)` matches `api.wait(sessionId, timeoutMs)` matches tool parameter `timeout_ms`.

---

**Plan complete and saved to `.lychee/artifacts/plans/2025-06-03-visual-companion-wait-focus.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints

Which approach?
