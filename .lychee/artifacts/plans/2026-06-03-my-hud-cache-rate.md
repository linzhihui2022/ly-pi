# my-hud Cache Rate Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `cacheRead / (cacheRead + input)` percentage metric to the my-hud status bar, displayed after `cost`.

**Architecture:** Pure helper `formatCacheRate` added to `format.ts` (mirrors `formatTokens`), consumed by `buildStatusLine` in `render.ts`. Icon sourced from Nerd Font bar-chart glyph.

**Tech Stack:** TypeScript, Vitest

---

## File Map

| File | Role |
|------|------|
| `pi-extensions/my-hud/format.ts` | Add `formatCacheRate` pure helper |
| `pi-extensions/my-hud/icons.ts` | Add `cacheRate` Nerd Font icon (`\uf080`) |
| `pi-extensions/my-hud/render.ts` | Append cache-rate segment in `buildStatusLine` |
| `pi-extensions/my-hud/index.test.ts` | Add tests for `formatCacheRate`; update `buildStatusLine` assertions |

---

### Task 1: Add `formatCacheRate` to `format.ts`

**Files:**
- Modify: `pi-extensions/my-hud/format.ts`
- Test: `pi-extensions/my-hud/index.test.ts`

- [ ] **Step 1: Write the failing test**

Open `pi-extensions/my-hud/index.test.ts` and add a new `describe` block after the `contextColored` tests:

```ts
describe("formatCacheRate", () => {
  it("returns 0% when both values are zero", async () => {
    const { formatCacheRate } = await loadModule();
    expect(formatCacheRate(0, 0)).toBe("0%");
  });

  it("returns 0% when cacheRead is zero but input is non-zero", async () => {
    const { formatCacheRate } = await loadModule();
    expect(formatCacheRate(100, 0)).toBe("0%");
  });

  it("returns 50% when cacheRead equals input", async () => {
    const { formatCacheRate } = await loadModule();
    expect(formatCacheRate(100, 100)).toBe("50%");
  });

  it("returns 80% when cacheRead is 4x input", async () => {
    const { formatCacheRate } = await loadModule();
    expect(formatCacheRate(100, 400)).toBe("80%");
  });

  it("rounds to nearest integer", async () => {
    const { formatCacheRate } = await loadModule();
    expect(formatCacheRate(3, 1)).toBe("25%"); // 1/4 = 25%
    expect(formatCacheRate(2, 1)).toBe("33%"); // 1/3 = 33.3...% → 33%
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run pi-extensions/my-hud/index.test.ts -t "formatCacheRate"
```

Expected: FAIL with "formatCacheRate is not a function" or similar.

- [ ] **Step 3: Write minimal implementation**

Open `pi-extensions/my-hud/format.ts` and append the new function after `shortModelName`:

```ts
/**
 * Format cache hit rate as a percentage.
 * cacheRead / (cacheRead + input), rounded to nearest integer.
 */
export function formatCacheRate(input: number, cacheRead: number): string {
  const total = cacheRead + input;
  if (total === 0) return "0%";
  return `${Math.round((cacheRead / total) * 100)}%`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run pi-extensions/my-hud/index.test.ts -t "formatCacheRate"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-hud/format.ts pi-extensions/my-hud/index.test.ts
git commit -m "feat(my-hud): add formatCacheRate helper with tests"
```

---

### Task 2: Add `cacheRate` icon to `icons.ts`

**Files:**
- Modify: `pi-extensions/my-hud/icons.ts`

- [ ] **Step 1: Add the icon entry**

Open `pi-extensions/my-hud/icons.ts` and insert `cacheRate: "\uf080 "` after `cost` in the `icons` object:

```ts
const icons = {
  project: "\uf07b ",
  model: "\uf135 ",
  context_0: "\uf244 ",
  context_25: "\uf243 ",
  context_50: "\uf242 ",
  context_75: "\uf241 ",
  context_100: "\uf240 ",
  branch: "\uf09b ",
  input: "\uf062 ",
  output: "\uf063 ",
  cacheRead: "\uf1b2 ",
  cost: "\uf157",
  cacheRate: "\uf080 ",  // NEW
  terminal: "\uf120  "
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add pi-extensions/my-hud/icons.ts
git commit -m "feat(my-hud): add cacheRate bar-chart icon"
```

---

### Task 3: Wire cache rate into `render.ts`

**Files:**
- Modify: `pi-extensions/my-hud/render.ts`
- Test: `pi-extensions/my-hud/index.test.ts`

- [ ] **Step 1: Update `render.ts` to import and display the cache rate**

Open `pi-extensions/my-hud/render.ts`.

Add `formatCacheRate` to the existing import from `./format`:

```ts
import { formatTokens, shortModelName, formatCacheRate } from "./format";
```

In `buildStatusLine`, append a new segment after the `cost` push:

```ts
  parts.push(
    ctxColored,
    theme.fg("mdListBullet", `${icon("input")}${formatTokens(usage.input)}`),
    theme.fg("thinkingLow", `${icon("output")}${formatTokens(usage.output)}`),
    theme.fg("thinkingMedium", `${icon("cacheRead")}${formatTokens(usage.cacheRead)}`),
    theme.fg("toolDiffRemoved", `${icon("cost")}${usage.cost.toFixed(2)}`),
    theme.fg("accent", `${icon("cacheRate")}${formatCacheRate(usage.input, usage.cacheRead)}`), // NEW
  );
```

- [ ] **Step 2: Update `buildStatusLine` tests**

Open `pi-extensions/my-hud/index.test.ts`. In the `buildStatusLine` describe block, update the "builds a line with all parts when branch is present" test to assert the cache rate is present:

Find this assertion block:
```ts
    expect(line).toContain("my-project");
    expect(line).toContain("gpt-4");
    expect(line).toContain("main");
    expect(line).toContain("42%");
    expect(line).toContain("1.0k");
    expect(line).toContain("500");
    expect(line).toContain("100");
    expect(line).toContain("0.35");
```

Replace with:
```ts
    expect(line).toContain("my-project");
    expect(line).toContain("gpt-4");
    expect(line).toContain("main");
    expect(line).toContain("42%");
    expect(line).toContain("1.0k");
    expect(line).toContain("500");
    expect(line).toContain("100");
    expect(line).toContain("0.35");
    expect(line).toContain("9%"); // cacheRead=100 / (100+1000) ≈ 9%
```

- [ ] **Step 3: Run all tests to verify nothing breaks**

```bash
npx vitest run pi-extensions/my-hud/index.test.ts
```

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-hud/render.ts pi-extensions/my-hud/index.test.ts
git commit -m "feat(my-hud): display cache hit rate in status bar"
```

---

### Task 4: Verify coverage and deploy

- [ ] **Step 1: Run tests with coverage**

```bash
npx vitest run pi-extensions/my-hud/ --coverage
```

Expected: branches/functions/lines/statements all 100%. Excluded files remain excluded.

- [ ] **Step 2: Deploy to ~/.pi/agent/**

```bash
./install.sh
```

- [ ] **Step 3: Commit any remaining changes**

```bash
git status
# If clean, done. If not, add and commit.
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All design requirements (format helper, icon, render integration, tests) map to specific tasks.
- [x] **Placeholder scan:** No TBD/TODO/"implement later"/"similar to" found.
- [x] **Type consistency:** `formatCacheRate(input: number, cacheRead: number): string` is used consistently across all tasks.
