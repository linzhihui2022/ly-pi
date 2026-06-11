# Fix Meaningless Unit Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 12 `toBeDefined()` pseudo-assertions and remove 5 always-passing noise tests across four test files.

**Architecture:** Three change categories — (1) webtool render tests: assert on `theme.fg`/`theme.bold` spy calls instead of checking `toBeDefined()`; (2) visual-companion: delete truly no-op tests; (3) todo/server: delete typeof-default and tautological `__dirname` tests. No source files change.

**Tech Stack:** Vitest, TypeScript. Run tests with `npx vitest run --coverage` inside each extension directory.

---

### Task 1 — Fix `web_search` render tests in `my-webtool/index.test.ts`

**Files:**
- Modify: `pi-extensions/my-webtool/index.test.ts:122–250`

Background: `renderCall` / `renderResult` build a string by calling `theme.fg(colorKey, text)`. The test mocks `theme.fg = (_, t) => t`. Asserting on those spy calls is the right way to verify rendering logic.

- [ ] **Step 1: Replace the 6 `web_search` render tests**

Find and replace the block from `it("web_search renderCall returns Text component"` through the closing `});` of `it("web_search renderResult expands to show results"` (lines 122–250) with the following:

```ts
  it("renderCall formats query with theme colors", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webSearch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_search"
    )[0];

    const theme = {
      fg: vi.fn((_c: string, text: string) => text),
      bold: vi.fn((text: string) => text),
    };

    webSearch.renderCall({ query: "test" }, theme as any, {});
    expect(theme.bold).toHaveBeenCalledWith("WebSearch ");
    expect(theme.fg).toHaveBeenCalledWith("toolTitle", "WebSearch ");
    expect(theme.fg).toHaveBeenCalledWith("accent", '"test"');
  });

  it("renderResult emits warning color when partial", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webSearch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_search"
    )[0];

    const theme = { fg: vi.fn((_c: string, text: string) => text) };

    webSearch.renderResult(
      { content: [], details: {} },
      { expanded: false, isPartial: true },
      theme as any,
      {}
    );
    expect(theme.fg).toHaveBeenCalledOnce();
    expect(theme.fg).toHaveBeenCalledWith("warning", "Searching...");
  });

  it("renderResult emits plural result count", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webSearch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_search"
    )[0];

    const theme = { fg: vi.fn((_c: string, text: string) => text) };

    webSearch.renderResult(
      { content: [], details: { resultCount: 5, results: [] } },
      { expanded: false, isPartial: false },
      theme as any,
      {}
    );
    expect(theme.fg).toHaveBeenCalledWith("success", "✓ 5 results");
  });

  it("renderResult uses singular form for 1 result", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webSearch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_search"
    )[0];

    const theme = { fg: vi.fn((_c: string, text: string) => text) };

    webSearch.renderResult(
      { content: [], details: { resultCount: 1, results: [] } },
      { expanded: false, isPartial: false },
      theme as any,
      {}
    );
    expect(theme.fg).toHaveBeenCalledWith("success", "✓ 1 result");
  });

  it("renderResult defaults to 0 results when details is empty", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webSearch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_search"
    )[0];

    const theme = { fg: vi.fn((_c: string, text: string) => text) };

    webSearch.renderResult(
      { content: [], details: {} },
      { expanded: false, isPartial: false },
      theme as any,
      {}
    );
    expect(theme.fg).toHaveBeenCalledWith("success", "✓ 0 results");
  });

  it("renderResult appends preview lines when expanded", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webSearch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_search"
    )[0];

    const theme = { fg: vi.fn((_c: string, text: string) => text) };

    webSearch.renderResult(
      {
        content: [],
        details: {
          resultCount: 2,
          results: [{ title: "A", url: "https://a.com", snippet: "..." }],
        },
      },
      { expanded: true, isPartial: false },
      theme as any,
      {}
    );
    expect(theme.fg).toHaveBeenCalledWith("success", "✓ 2 results");
    expect(theme.fg).toHaveBeenCalledWith("dim", "• A");
  });
```

- [ ] **Step 2: Run tests**

```bash
cd pi-extensions/my-webtool && npx vitest run --reporter=verbose 2>&1 | tail -30
```

Expected: all tests pass (the 6 new ones replace the 6 old ones, net count unchanged).

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-webtool/index.test.ts
git commit -m "test(my-webtool): replace toBeDefined() with theme spy assertions for web_search render"
```

---

### Task 2 — Fix `web_fetch` render tests in `my-webtool/index.test.ts`

**Files:**
- Modify: `pi-extensions/my-webtool/index.test.ts:252–372`

- [ ] **Step 1: Replace the 6 `web_fetch` render tests**

Find and replace the block from `it("web_fetch renderCall returns Text component"` through the last `});` of `it("web_fetch renderResult skips non-text content when expanded"` (lines 252–372) with:

```ts
  it("renderCall formats URL with theme colors", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];

    const theme = {
      fg: vi.fn((_c: string, text: string) => text),
      bold: vi.fn((text: string) => text),
    };

    webFetch.renderCall({ url: "https://example.com" }, theme as any, {});
    expect(theme.bold).toHaveBeenCalledWith("WebFetch ");
    expect(theme.fg).toHaveBeenCalledWith("toolTitle", "WebFetch ");
    expect(theme.fg).toHaveBeenCalledWith("accent", "https://example.com");
  });

  it("renderResult emits warning color when partial", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];

    const theme = { fg: vi.fn((_c: string, text: string) => text) };

    webFetch.renderResult(
      { content: [], details: {} },
      { expanded: false, isPartial: true },
      theme as any,
      {}
    );
    expect(theme.fg).toHaveBeenCalledOnce();
    expect(theme.fg).toHaveBeenCalledWith("warning", "Fetching...");
  });

  it("renderResult appends title in muted color", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];

    const theme = { fg: vi.fn((_c: string, text: string) => text) };

    webFetch.renderResult(
      { content: [], details: { title: "Example" } },
      { expanded: false, isPartial: false },
      theme as any,
      {}
    );
    expect(theme.fg).toHaveBeenCalledWith("success", "✓ Fetched");
    expect(theme.fg).toHaveBeenCalledWith("muted", ": Example");
  });

  it("renderResult appends truncated warning when content was truncated", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];

    const theme = { fg: vi.fn((_c: string, text: string) => text) };

    webFetch.renderResult(
      { content: [], details: { truncation: { truncated: true } } },
      { expanded: false, isPartial: false },
      theme as any,
      {}
    );
    expect(theme.fg).toHaveBeenCalledWith("success", "✓ Fetched");
    expect(theme.fg).toHaveBeenCalledWith("warning", " (truncated)");
  });

  it("renderResult renders content preview lines when expanded", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];

    const theme = { fg: vi.fn((_c: string, text: string) => text) };

    webFetch.renderResult(
      { content: [{ type: "text", text: "Hello world" }], details: {} },
      { expanded: true, isPartial: false },
      theme as any,
      {}
    );
    expect(theme.fg).toHaveBeenCalledWith("success", "✓ Fetched");
    expect(theme.fg).toHaveBeenCalledWith("dim", "Hello world");
  });

  it("renderResult skips preview when expanded content is not text type", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];

    const theme = { fg: vi.fn((_c: string, text: string) => text) };

    webFetch.renderResult(
      { content: [{ type: "image", url: "http://x" }], details: {} },
      { expanded: true, isPartial: false },
      theme as any,
      {}
    );
    expect(theme.fg).toHaveBeenCalledWith("success", "✓ Fetched");
    expect(theme.fg).not.toHaveBeenCalledWith("dim", expect.any(String));
  });
```

- [ ] **Step 2: Run tests**

```bash
cd pi-extensions/my-webtool && npx vitest run --reporter=verbose 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-webtool/index.test.ts
git commit -m "test(my-webtool): replace toBeDefined() with theme spy assertions for web_fetch render"
```

---

### Task 3 — Remove noise tests in `my-visual-companion`

**Files:**
- Modify: `pi-extensions/my-visual-companion/index.test.ts`
- Modify: `pi-extensions/my-visual-companion/server.test.ts`

Three tests to delete:

| File | Test name | Why |
|------|-----------|-----|
| `index.test.ts` | `"exports a default function"` | TypeScript guarantees this at compile time |
| `index.test.ts` | `"session_start handler does not throw"` | Handler body is `// nothing to do` — literally empty |
| `index.test.ts` | `"uses default idleTimeoutMinutes when not in config"` | Only asserts `registerTool` called 5×, which `"registers 5 LLM tools"` already covers |
| `server.test.ts` | entire `resolveExtDir` describe block | Function is `return __dirname`; test compares to `__dirname` — tautological |

- [ ] **Step 1: Delete 3 tests from `index.test.ts`**

Remove lines 57–60 (`"exports a default function"`):
```ts
// DELETE this entire it block:
it("exports a default function", async () => {
  const mod = await import("./index");
  expect(typeof mod.default).toBe("function");
});
```

Remove lines 86–90 (`"session_start handler does not throw"`):
```ts
// DELETE this entire it block:
it("session_start handler does not throw", async () => {
  await loadAndRegister();
  const startHandler = registeredEvents.get("session_start");
  expect(() => startHandler?.({ type: "session_start" })).not.toThrow();
});
```

Remove lines 92–99 (`"uses default idleTimeoutMinutes when not in config"`):
```ts
// DELETE this entire it block:
it("uses default idleTimeoutMinutes when not in config", async () => {
  vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}));
  const mod = await import("./index");
  mod.default(mockPi as any);
  // Should not throw — verifies the extension loads with default config
  expect(mockPi.registerTool).toHaveBeenCalledTimes(5);
});
```

- [ ] **Step 2: Delete the `resolveExtDir` describe block from `server.test.ts`**

Remove lines 19–23:
```ts
// DELETE this entire describe block:
describe("resolveExtDir", () => {
  it("returns __dirname", () => {
    expect(resolveExtDir()).toBe(__dirname);
  });
});
```

Also remove `resolveExtDir` from the import on line 3 if it's no longer used anywhere in the file.

- [ ] **Step 3: Run tests**

```bash
cd pi-extensions/my-visual-companion && npx vitest run --reporter=verbose 2>&1 | tail -30
```

Expected: all remaining tests pass. Test count drops by 4.

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-visual-companion/index.test.ts pi-extensions/my-visual-companion/server.test.ts
git commit -m "test(my-visual-companion): remove tautological and no-op tests"
```

---

### Task 4 — Remove noise test in `my-todo`

**Files:**
- Modify: `pi-extensions/my-todo/index.test.ts:48–51`

- [ ] **Step 1: Delete `"exports a default function"` test**

Remove lines 48–51:
```ts
// DELETE this entire it block:
it("exports a default function", async () => {
  const mod = await import("./index");
  expect(typeof mod.default).toBe("function");
});
```

- [ ] **Step 2: Run tests**

```bash
cd pi-extensions/my-todo && npx vitest run --reporter=verbose 2>&1 | tail -20
```

Expected: all remaining tests pass.

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-todo/index.test.ts
git commit -m "test(my-todo): remove typeof default export test"
```

---

## Summary

| Category | Before | After |
|----------|--------|-------|
| `toBeDefined()` pseudo-tests | 12 | 0 |
| Always-passing noise tests | 5 | 0 |
| Total tests removed/replaced | 17 | — |
| Net test count change | — | −5 (12 replaced in-kind, 5 deleted) |
