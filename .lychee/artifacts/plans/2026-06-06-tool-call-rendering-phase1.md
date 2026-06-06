# Tool Call Rendering — Phase 1: Read Rendering

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Pi extension that overrides `read` tool rendering with configurable output modes (hidden/summary/preview), defaulting to summary mode.

**Architecture:** Four-module extension: config (types + load/save), render-utils (shared helpers), tool-overrides (read renderCall + renderResult), index (lifecycle entrypoint). Tests live alongside source as `*.test.ts` files.

**Tech Stack:** TypeScript, Vitest, Pi Extension API (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`)

---

## File Map

| File | Responsibility |
|---|---|
| `pi-extensions/my-tool-display/config.ts` | Types, defaults, config load/save, normalization |
| `pi-extensions/my-tool-display/render-utils.ts` | extractTextOutput, splitLines, pluralize, previewLines, shortenPath |
| `pi-extensions/my-tool-display/tool-overrides.ts` | read tool with renderCall + renderResult |
| `pi-extensions/my-tool-display/index.ts` | Extension entrypoint, lifecycle hooks |
| `pi-extensions/my-tool-display/my-tool-display.json` | Default runtime config |
| `pi-extensions/my-tool-display/render-read.test.ts` | Tests for read call + result rendering |

---

### Task 1: Create directory and default config

**Files:**
- Create: `pi-extensions/my-tool-display/my-tool-display.json`

- [ ] **Step 1: Write default config file**

```json
{
  "readOutputMode": "summary",
  "searchOutputMode": "count",
  "bashOutputMode": "summary",
  "mcpOutputMode": "summary",
  "previewLines": 8,
  "diffViewMode": "auto",
  "diffCollapsedLines": 24,
  "thinkingLabelEnabled": true,
  "userMessageBoxEnabled": true
}
```

- [ ] **Step 2: Commit**

```bash
git add pi-extensions/my-tool-display/my-tool-display.json
git commit -m "feat(my-tool-display): add default config"
```

---

### Task 2: Write config.ts (types, defaults, load/save)

**Files:**
- Create: `pi-extensions/my-tool-display/config.ts`

- [ ] **Step 1: Write config.ts**

```typescript
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// --- Types ---

export const READ_OUTPUT_MODES = ["hidden", "summary", "preview"] as const;
export const SEARCH_OUTPUT_MODES = ["hidden", "count", "preview"] as const;
export const BASH_OUTPUT_MODES = ["opencode", "summary", "preview"] as const;
export const MCP_OUTPUT_MODES = ["hidden", "summary", "preview"] as const;
export const DIFF_VIEW_MODES = ["auto", "split", "unified"] as const;

export type ReadOutputMode = (typeof READ_OUTPUT_MODES)[number];
export type SearchOutputMode = (typeof SEARCH_OUTPUT_MODES)[number];
export type BashOutputMode = (typeof BASH_OUTPUT_MODES)[number];
export type McpOutputMode = (typeof MCP_OUTPUT_MODES)[number];
export type DiffViewMode = (typeof DIFF_VIEW_MODES)[number];

export interface ToolDisplayConfig {
  readOutputMode: ReadOutputMode;
  searchOutputMode: SearchOutputMode;
  bashOutputMode: BashOutputMode;
  mcpOutputMode: McpOutputMode;
  previewLines: number;
  diffViewMode: DiffViewMode;
  diffCollapsedLines: number;
  thinkingLabelEnabled: boolean;
  userMessageBoxEnabled: boolean;
}

export const DEFAULT_CONFIG: ToolDisplayConfig = {
  readOutputMode: "summary",
  searchOutputMode: "count",
  bashOutputMode: "summary",
  mcpOutputMode: "summary",
  previewLines: 8,
  diffViewMode: "auto",
  diffCollapsedLines: 24,
  thinkingLabelEnabled: true,
  userMessageBoxEnabled: true,
};

// --- Resolve extension directory ---

function getExtensionDir(): string {
  if (typeof __dirname !== "undefined") return __dirname;
  try { return dirname(fileURLToPath(import.meta.url)); } catch { /* not ESM */ }
  return process.cwd();
}

const CONFIG_PATH = join(getExtensionDir(), "my-tool-display.json");

// --- Config operations ---

export function loadConfig(): ToolDisplayConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return normalizeConfig(parsed);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: ToolDisplayConfig): boolean {
  try {
    const normalized = normalizeConfig(config);
    writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 2) + "\n", "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function normalizeConfig(raw: Record<string, unknown>): ToolDisplayConfig {
  const merged: ToolDisplayConfig = { ...DEFAULT_CONFIG };

  if (typeof raw.readOutputMode === "string" && (READ_OUTPUT_MODES as readonly string[]).includes(raw.readOutputMode)) {
    merged.readOutputMode = raw.readOutputMode as ReadOutputMode;
  }
  if (typeof raw.searchOutputMode === "string" && (SEARCH_OUTPUT_MODES as readonly string[]).includes(raw.searchOutputMode)) {
    merged.searchOutputMode = raw.searchOutputMode as SearchOutputMode;
  }
  if (typeof raw.bashOutputMode === "string" && (BASH_OUTPUT_MODES as readonly string[]).includes(raw.bashOutputMode)) {
    merged.bashOutputMode = raw.bashOutputMode as BashOutputMode;
  }
  if (typeof raw.mcpOutputMode === "string" && (MCP_OUTPUT_MODES as readonly string[]).includes(raw.mcpOutputMode)) {
    merged.mcpOutputMode = raw.mcpOutputMode as McpOutputMode;
  }
  if (typeof raw.previewLines === "number" && Number.isFinite(raw.previewLines)) {
    merged.previewLines = Math.max(1, Math.floor(raw.previewLines));
  }
  if (typeof raw.diffViewMode === "string" && (DIFF_VIEW_MODES as readonly string[]).includes(raw.diffViewMode)) {
    merged.diffViewMode = raw.diffViewMode as DiffViewMode;
  }
  if (typeof raw.diffCollapsedLines === "number" && Number.isFinite(raw.diffCollapsedLines)) {
    merged.diffCollapsedLines = Math.max(1, Math.floor(raw.diffCollapsedLines));
  }
  if (typeof raw.thinkingLabelEnabled === "boolean") {
    merged.thinkingLabelEnabled = raw.thinkingLabelEnabled;
  }
  if (typeof raw.userMessageBoxEnabled === "boolean") {
    merged.userMessageBoxEnabled = raw.userMessageBoxEnabled;
  }

  return merged;
}
```

- [ ] **Step 2: Run type check**

The file has no runtime dependencies beyond Node builtins and should compile cleanly.

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-tool-display/config.ts
git commit -m "feat(my-tool-display): add config module with types, defaults, load/save"
```

---

### Task 3: Write render-utils.ts (shared rendering helpers)

**Files:**
- Create: `pi-extensions/my-tool-display/render-utils.ts`

- [ ] **Step 1: Write render-utils.ts**

```typescript
import { homedir } from "node:os";

interface TextLikeBlock {
  type: string;
  text?: string;
}

interface ToolResultLike {
  content?: unknown;
}

/**
 * Extract plain text output from a tool result's content blocks.
 */
export function extractTextOutput(result: ToolResultLike): string {
  const blocks = Array.isArray(result.content) ? result.content : [];
  const textBlocks = blocks.filter(
    (block): block is TextLikeBlock =>
      typeof block === "object" &&
      block !== null &&
      "type" in block &&
      (block as TextLikeBlock).type === "text" &&
      typeof (block as TextLikeBlock).text === "string",
  );
  return textBlocks.map((b) => b.text ?? "").join("\n");
}

/**
 * Split text into lines, normalizing tabs to 4 spaces and stripping \r.
 */
export function splitLines(text: string): string[] {
  if (!text) return [];
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\t/g, "    "));
}

/**
 * Collapse trailing empty lines and consecutive empty lines when not expanded.
 */
export function compactOutputLines(
  lines: string[],
  expanded: boolean,
): string[] {
  // Trim trailing empty lines
  const trimmed = [...lines];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1]?.trim().length === 0) {
    trimmed.pop();
  }

  if (expanded) return trimmed;

  // Collapse consecutive empty lines to 1
  const compacted: string[] = [];
  let consecutiveEmpty = 0;
  for (const line of trimmed) {
    if (line.trim().length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty > 1) continue;
    } else {
      consecutiveEmpty = 0;
    }
    compacted.push(line);
  }
  return compacted;
}

/**
 * Count non-empty lines.
 */
export function countNonEmptyLines(lines: string[]): number {
  return lines.filter((line) => line.trim().length > 0).length;
}

/**
 * Pluralize a word based on count.
 */
export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return count === 1 ? singular : plural;
}

/**
 * Return the first `maxLines` lines and the remaining count.
 */
export function previewLines(
  lines: string[],
  maxLines: number,
): { shown: string[]; remaining: number } {
  const limit = Math.max(0, maxLines);
  const shown = lines.slice(0, limit);
  const remaining = Math.max(0, lines.length - shown.length);
  return { shown, remaining };
}

/**
 * Shorten a file path by replacing home directory with ~.
 */
export function shortenPath(inputPath: string | undefined): string {
  if (!inputPath) return "";
  const home = homedir();
  return inputPath.startsWith(home) ? `~${inputPath.slice(home.length)}` : inputPath;
}
```

- [ ] **Step 2: Run type check**

No external dependencies beyond Node builtins.

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-tool-display/render-utils.ts
git commit -m "feat(my-tool-display): add shared rendering utilities"
```

---

### Task 4: Write failing tests for read rendering

**Files:**
- Create: `pi-extensions/my-tool-display/render-read.test.ts`

- [ ] **Step 1: Write render-read.test.ts**

```typescript
import { describe, it, expect } from "vitest";

// --- Inline mocks for @earendil-works/pi-tui ---
// Pi TUI's Text component: constructor(text: string, width: number, ...)
class MockText {
  constructor(public content: string, _width?: number, _height?: number) {}
}

const mockTheme = {
  fg: (_color: string, text: string): string => text,
  bold: (text: string): string => text,
};

// --- Import modules under test ---
// We import the pure functions directly; integration with Pi lifecycle is tested via integration later.
import { extractTextOutput, splitLines, compactOutputLines, pluralize, previewLines, shortenPath, countNonEmptyLines } from "./render-utils";
import { normalizeConfig, DEFAULT_CONFIG } from "./config";

// Read tool specific rendering functions (imported from tool-overrides)
import { createReadToolOverride } from "./tool-overrides";

// ============================================================
// render-utils tests
// ============================================================

describe("extractTextOutput", () => {
  it("extracts text from content blocks", () => {
    const result = {
      content: [
        { type: "text", text: "line 1\nline 2" },
        { type: "image", data: "..." },
      ],
    };
    expect(extractTextOutput(result)).toBe("line 1\nline 2");
  });

  it("returns empty string for no content", () => {
    expect(extractTextOutput({})).toBe("");
  });

  it("returns empty string for non-array content", () => {
    expect(extractTextOutput({ content: "not array" })).toBe("");
  });

  it("skips blocks with no text field", () => {
    const result = {
      content: [
        { type: "text" },
        { type: "text", text: "hello" },
      ],
    };
    expect(extractTextOutput(result)).toBe("hello");
  });
});

describe("splitLines", () => {
  it("splits text into lines", () => {
    expect(splitLines("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("replaces tabs with 4 spaces", () => {
    expect(splitLines("a\tb")).toEqual(["a    b"]);
  });

  it("strips carriage returns", () => {
    expect(splitLines("a\r\nb")).toEqual(["a", "b"]);
  });

  it("handles empty string", () => {
    expect(splitLines("")).toEqual([]);
  });
});

describe("compactOutputLines", () => {
  it("trims trailing empty lines", () => {
    const lines = ["a", "", "", ""];
    expect(compactOutputLines(lines, false)).toEqual(["a"]);
  });

  it("collapses consecutive empty lines to one when not expanded", () => {
    const lines = ["a", "", "", "b"];
    expect(compactOutputLines(lines, false)).toEqual(["a", "", "b"]);
  });

  it("preserves all empty lines when expanded", () => {
    const lines = ["a", "", "", "b", ""];
    // trailing empty still trimmed in expanded mode
    expect(compactOutputLines(lines, true)).toEqual(["a", "", "", "b"]);
  });

  it("handles all-empty array", () => {
    expect(compactOutputLines(["", "", ""], false)).toEqual([]);
  });
});

describe("countNonEmptyLines", () => {
  it("counts non-empty lines", () => {
    expect(countNonEmptyLines(["a", "", "b", "", "c"])).toBe(3);
  });

  it("returns 0 for all empty", () => {
    expect(countNonEmptyLines(["", "  "])).toBe(0);
  });
});

describe("pluralize", () => {
  it("uses singular for count 1", () => {
    expect(pluralize(1, "line")).toBe("line");
  });

  it("uses default plural (append s) for count > 1", () => {
    expect(pluralize(3, "line")).toBe("lines");
  });

  it("uses custom plural", () => {
    expect(pluralize(2, "match", "matches")).toBe("matches");
  });
});

describe("previewLines", () => {
  it("returns all lines when under limit", () => {
    const result = previewLines(["a", "b", "c"], 5);
    expect(result.shown).toEqual(["a", "b", "c"]);
    expect(result.remaining).toBe(0);
  });

  it("truncates and reports remaining", () => {
    const result = previewLines(["a", "b", "c", "d", "e"], 3);
    expect(result.shown).toEqual(["a", "b", "c"]);
    expect(result.remaining).toBe(2);
  });

  it("handles maxLines = 0", () => {
    const result = previewLines(["a", "b"], 0);
    expect(result.shown).toEqual([]);
    expect(result.remaining).toBe(2);
  });
});

describe("shortenPath", () => {
  it("shortens home directory path", () => {
    const { homedir } = require("node:os") as typeof import("node:os");
    const home = homedir();
    const path = `${home}/src/file.ts`;
    expect(shortenPath(path)).toBe("~/src/file.ts");
  });

  it("returns empty string for undefined", () => {
    expect(shortenPath(undefined)).toBe("");
  });
});

// ============================================================
// config tests
// ============================================================

describe("normalizeConfig", () => {
  it("returns defaults for empty input", () => {
    expect(normalizeConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it("merges valid overrides", () => {
    const result = normalizeConfig({ readOutputMode: "hidden", previewLines: 20 });
    expect(result.readOutputMode).toBe("hidden");
    expect(result.previewLines).toBe(20);
    expect(result.searchOutputMode).toBe(DEFAULT_CONFIG.searchOutputMode);
  });

  it("ignores invalid values for enum fields", () => {
    const result = normalizeConfig({ readOutputMode: "invalid_mode" });
    expect(result.readOutputMode).toBe(DEFAULT_CONFIG.readOutputMode);
  });

  it("clamps previewLines to at least 1", () => {
    const result = normalizeConfig({ previewLines: -5 });
    expect(result.previewLines).toBe(1);
  });

  it("rounds non-integer previewLines", () => {
    const result = normalizeConfig({ previewLines: 3.7 });
    expect(result.previewLines).toBe(3);
  });

  it("accepts boolean fields", () => {
    const result = normalizeConfig({ thinkingLabelEnabled: false, userMessageBoxEnabled: false });
    expect(result.thinkingLabelEnabled).toBe(false);
    expect(result.userMessageBoxEnabled).toBe(false);
  });
});

// ============================================================
// read tool rendering tests
// ============================================================

function makeRenderContext(overrides: Record<string, unknown> = {}) {
  return {
    args: {},
    toolCallId: "test-call",
    cwd: "/project",
    argsComplete: true,
    isError: false,
    isPartial: false,
    expanded: false,
    ...overrides,
  };
}

function makeToolResult(text: string, overrides: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text", text }],
    details: {},
    ...overrides,
  };
}

describe("read renderCall", () => {
  const override = createReadToolOverride(() => DEFAULT_CONFIG);

  it("renders basic path", () => {
    const result = override.renderCall?.({ file_path: "src/app.ts" }, mockTheme, makeRenderContext());
    expect(result).toBeInstanceOf(MockText);
    expect((result as MockText).content).toContain("read");
    expect((result as MockText).content).toContain("src/app.ts");
  });

  it("renders with offset", () => {
    const result = override.renderCall?.({ file_path: "src/app.ts", offset: 42 }, mockTheme, makeRenderContext());
    expect((result as MockText).content).toContain(":42");
  });

  it("renders with offset and limit", () => {
    const result = override.renderCall?.({ file_path: "src/app.ts", offset: 10, limit: 20 }, mockTheme, makeRenderContext());
    expect((result as MockText).content).toContain(":10-30");
  });

  it("renders missing path as ...", () => {
    const result = override.renderCall?.({}, mockTheme, makeRenderContext());
    expect((result as MockText).content).toContain("...");
  });
});

describe("read renderResult — summary mode", () => {
  const override = createReadToolOverride(() => ({ ...DEFAULT_CONFIG, readOutputMode: "summary" }));

  it("shows line count for non-expanded result", () => {
    const result = override.renderResult?.(makeToolResult("line1\nline2\nline3"), { expanded: false, isPartial: false }, mockTheme, makeRenderContext());
    expect((result as MockText).content).toContain("loaded 3 lines");
  });

  it("shows full content when expanded", () => {
    const result = override.renderResult?.(makeToolResult("line1\nline2"), { expanded: true, isPartial: false }, mockTheme, makeRenderContext());
    expect((result as MockText).content).toContain("line1");
    expect((result as MockText).content).toContain("line2");
  });

  it("shows expand hint when not expanded", () => {
    const result = override.renderResult?.(makeToolResult("x"), { expanded: false, isPartial: false }, mockTheme, makeRenderContext());
    expect((result as MockText).content).toContain("Ctrl+O");
  });
});

describe("read renderResult — hidden mode", () => {
  const override = createReadToolOverride(() => ({ ...DEFAULT_CONFIG, readOutputMode: "hidden" }));

  it("returns empty text", () => {
    const result = override.renderResult?.(makeToolResult("line1\nline2"), { expanded: false, isPartial: false }, mockTheme, makeRenderContext());
    expect((result as MockText).content).toBe("");
  });
});

describe("read renderResult — preview mode", () => {
  const override = createReadToolOverride(() => ({ ...DEFAULT_CONFIG, readOutputMode: "preview", previewLines: 3 }));

  it("shows first N lines", () => {
    const lines = ["a", "b", "c", "d", "e"].join("\n");
    const result = override.renderResult?.(makeToolResult(lines), { expanded: false, isPartial: false }, mockTheme, makeRenderContext());
    expect((result as MockText).content).toContain("a");
    expect((result as MockText).content).toContain("c");
    expect((result as MockText).content).toContain("more lines");
  });

  it("shows all lines when under limit", () => {
    const result = override.renderResult?.(makeToolResult("a\nb"), { expanded: false, isPartial: false }, mockTheme, makeRenderContext());
    expect((result as MockText).content).toContain("a");
    expect((result as MockText).content).toContain("b");
    expect((result as MockText).content).not.toContain("more");
  });

  it("shows full content when expanded", () => {
    const lines = ["a", "b", "c", "d", "e"].join("\n");
    const result = override.renderResult?.(makeToolResult(lines), { expanded: true, isPartial: false }, mockTheme, makeRenderContext());
    expect((result as MockText).content).toContain("a");
    expect((result as MockText).content).toContain("e");
  });
});

describe("read renderResult — edge cases", () => {
  const override = createReadToolOverride(() => DEFAULT_CONFIG);

  it("shows reading... when partial", () => {
    const result = override.renderResult?.(makeToolResult(""), { expanded: false, isPartial: true }, mockTheme, makeRenderContext());
    expect((result as MockText).content).toContain("reading...");
  });

  it("shows no output for empty result", () => {
    const result = override.renderResult?.(makeToolResult(""), { expanded: false, isPartial: false }, mockTheme, makeRenderContext());
    expect((result as MockText).content).toContain("no output");
  });
});
```

- [ ] **Step 2: Run tests — expected FAIL**

```bash
npx vitest run pi-extensions/my-tool-display/render-read.test.ts
```

Expected: FAIL — `createReadToolOverride` not yet defined.

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-tool-display/render-read.test.ts
git commit -m "test(my-tool-display): add failing tests for read rendering"
```

---

### Task 5: Write tool-overrides.ts (read tool with renderCall + renderResult)

**Files:**
- Create: `pi-extensions/my-tool-display/tool-overrides.ts`

- [ ] **Step 1: Write tool-overrides.ts**

```typescript
import { Text } from "@earendil-works/pi-tui";
import type {
  ToolDisplayConfig,
  ReadOutputMode,
} from "./config";
import {
  extractTextOutput,
  splitLines,
  compactOutputLines,
  countNonEmptyLines,
  pluralize,
  previewLines,
  shortenPath,
} from "./render-utils";

// --- Theme interface ---

interface RenderTheme {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

// --- Context interface ---

interface ToolRenderContextLike {
  args?: unknown;
  toolCallId?: string;
  cwd?: string;
  argsComplete?: boolean;
  isError?: boolean;
  isPartial?: boolean;
  expanded?: boolean;
}

// --- Helper: get string/number fields from args ---

function getStringField(value: unknown, field: string): string | undefined {
  const record = value as Record<string, unknown> | undefined;
  if (!record) return undefined;
  const raw = record[field];
  return typeof raw === "string" ? raw : undefined;
}

function getNumericField(value: unknown, field: string): number | undefined {
  const record = value as Record<string, unknown> | undefined;
  if (!record) return undefined;
  const raw = record[field];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

// --- Build preview text ---

function buildPreviewText(
  lines: string[],
  maxLines: number,
  theme: RenderTheme,
  expanded: boolean,
): string {
  if (lines.length === 0) {
    return theme.fg("muted", "↳ (no output)");
  }

  const { shown, remaining } = previewLines(lines, maxLines);
  let text = shown.join("\n");
  if (remaining > 0) {
    const hint = expanded ? "" : " • Ctrl+O to expand";
    text += `\n${theme.fg("muted", `... (${remaining} more ${pluralize(remaining, "line")}${hint})`)}`;
  }
  return text;
}

// --- Format read summary ---

function formatReadSummary(
  rawOutput: string,
  theme: RenderTheme,
): string {
  const lines = compactOutputLines(splitLines(rawOutput), true);
  const lineCount = countNonEmptyLines(lines);
  return theme.fg("muted", `↳ loaded ${lineCount} ${pluralize(lineCount, "line")}`);
}

// --- Expanded preview cap ---

function getExpandedPreviewLineLimit(lines: string[]): number {
  const cap = 4000;
  return Math.min(lines.length, cap);
}

// --- Render read result ---

function renderReadResult(
  result: { content?: Array<{ type: string; text?: string }>; details?: unknown },
  options: { expanded: boolean; isPartial: boolean },
  theme: RenderTheme,
  config: ToolDisplayConfig,
): Text {
  if (options.isPartial) {
    return new Text(theme.fg("warning", "reading..."), 0, 0);
  }

  if (config.readOutputMode === "hidden") {
    return new Text("", 0, 0);
  }

  const rawOutput = extractTextOutput(result);
  const lines = compactOutputLines(splitLines(rawOutput), options.expanded);

  if (config.readOutputMode === "summary") {
    if (options.expanded) {
      const maxLines = getExpandedPreviewLineLimit(lines);
      const preview = buildPreviewText(lines, maxLines, theme, true);
      return new Text(preview, 0, 0);
    }

    let summary = formatReadSummary(rawOutput, theme);
    summary += `\n${theme.fg("muted", "  • Ctrl+O to expand")}`;
    return new Text(summary, 0, 0);
  }

  // preview mode (default branch for any recognized mode)
  const maxLines = options.expanded
    ? getExpandedPreviewLineLimit(lines)
    : config.previewLines;
  const preview = buildPreviewText(lines, maxLines, theme, options.expanded);
  return new Text(preview, 0, 0);
}

// --- Render read call ---

function renderReadCall(
  args: unknown,
  theme: RenderTheme,
): Text {
  const path = shortenPath(getStringField(args, "file_path") ?? getStringField(args, "path"));
  const offset = getNumericField(args, "offset");
  const limit = getNumericField(args, "limit");

  let suffix = "";
  if (offset !== undefined || limit !== undefined) {
    const from = offset ?? 1;
    const to = limit !== undefined ? from + limit - 1 : undefined;
    suffix = to ? `:${from}-${to}` : `:${from}`;
  }

  const line = `${theme.fg("toolTitle", theme.bold("read"))} ${theme.fg("accent", path || "...")}${theme.fg("warning", suffix)}`;
  return new Text(line, 0, 0);
}

// --- Factory: creates a read tool override definition ---

type ConfigGetter = () => ToolDisplayConfig;

export function createReadToolOverride(getConfig: ConfigGetter) {
  return {
    name: "read" as const,
    label: "read",
    description: "Read the contents of a file",
    renderCall: (args: unknown, theme: RenderTheme, _context?: ToolRenderContextLike) =>
      renderReadCall(args, theme),
    renderResult: (
      result: { content?: Array<{ type: string; text?: string }>; details?: unknown },
      options: { expanded: boolean; isPartial: boolean },
      theme: RenderTheme,
      _context?: ToolRenderContextLike,
    ) => renderReadResult(result, options, theme, getConfig()),
  };
}
```

- [ ] **Step 2: Run tests — expected PASS**

```bash
npx vitest run pi-extensions/my-tool-display/render-read.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Run coverage check**

```bash
npx vitest run pi-extensions/my-tool-display/ --coverage
```

Expected: 100% branch/function/line/statement on render-utils.ts, config.ts, tool-overrides.ts.

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-tool-display/tool-overrides.ts
git commit -m "feat(my-tool-display): add read tool override with configurable rendering"
```

---

### Task 6: Write index.ts (extension entrypoint)

**Files:**
- Create: `pi-extensions/my-tool-display/index.ts`

- [ ] **Step 1: Write index.ts**

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createReadTool } from "@earendil-works/pi-coding-agent";
import { loadConfig, type ToolDisplayConfig } from "./config";
import { createReadToolOverride } from "./tool-overrides";

export default function myToolDisplay(pi: ExtensionAPI): void {
  let config: ToolDisplayConfig = loadConfig();

  const getConfig = (): ToolDisplayConfig => config;

  pi.on("before_agent_start", async () => {
    // Refresh config in case it changed externally
    config = loadConfig();

    // Register read tool override
    const readOverride = createReadToolOverride(getConfig);
    const builtInRead = createReadTool(process.cwd());

    pi.registerTool({
      name: readOverride.name,
      label: readOverride.label,
      description: builtInRead.description,
      parameters: builtInRead.parameters,
      prepareArguments: builtInRead.prepareArguments,
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        return builtInRead.execute(toolCallId, params, signal, onUpdate);
      },
      renderCall: readOverride.renderCall,
      renderResult: readOverride.renderResult,
    } as any);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add pi-extensions/my-tool-display/index.ts
git commit -m "feat(my-tool-display): add extension entrypoint with lifecycle hooks"
```

---

### Task 7: Add extension to install script

**Files:**
- Modify: `install.sh`

- [ ] **Step 1: Check if my-tool-display is in install.sh**

```bash
grep "my-tool-display" install.sh
```

Expected: no match (not yet added).

- [ ] **Step 2: Add to install.sh**

Read `install.sh` first, find the section that copies extensions to `~/.pi/agent/extensions/`, then add:

```bash
cp -r pi-extensions/my-tool-display "$TARGET/extensions/"
```

- [ ] **Step 3: Run install**

```bash
./install.sh
```

- [ ] **Step 4: Commit**

```bash
git add install.sh
git commit -m "chore(install): add my-tool-display to install script"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run pi-extensions/my-tool-display/
```

Expected: All tests pass.

- [ ] **Step 2: Run coverage**

```bash
npx vitest run pi-extensions/my-tool-display/ --coverage
```

Expected: 100% coverage on all source files (excluding index.ts).

- [ ] **Step 3: Deploy and reload**

```bash
./install.sh
```

Then in a running Pi session: `/reload`

Expected: Extension loads without errors, `read` tool calls render with summary mode.
