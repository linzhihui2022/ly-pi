# my-pr-review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Pi Extension that replicates `pr-review-toolkit:review-pr` — fetching PR diffs, creating isolated worktrees, running 6 specialized review analyses, and persisting structured markdown reports.

**Architecture:** Extension registers 8 tools (`review_pr` + 6专项 + `save_review`) and 2 slash commands. `review_pr` fetches diffs and optionally creates git worktrees;专项 tools extract structured review materials from the diff; the main agent orchestrates routing and synthesis. Extension never calls LLM APIs — it provides data extraction only.

**Tech Stack:** TypeScript, Vitest, `@earendil-works/pi-coding-agent` ExtensionAPI, `gh` CLI, `typebox` for parameter schemas.

---

## File Structure

```
pi-extensions/my-pr-review/
├── package.json              # Dependencies, scripts
├── tsconfig.json             # TypeScript config
├── vitest.config.ts          # Test config
├── my-pr-review.json         # Default extension config
├── types.ts                  # Shared schemas and interfaces
├── config.ts                 # Config loading
├── git.ts                    # PR URL parse, worktree CRUD, diff fetch
├── parser.ts                 # Diff parse: files, hunks, stats
├── reviewers/
│   ├── comments.ts           # Comment extraction + accuracy heuristics
│   ├── tests.ts              # Test file detection, coverage mapping
│   ├── errors.ts             # Error handling pattern extraction
│   ├── types.ts              # Type/interface change extraction
│   ├── quality.ts            # Complexity, duplication, style rules
│   └── simplification.ts     # Complexity metrics + extraction candidates
├── render.ts                 # TUI renderCall / renderResult
├── index.ts                  # Register 8 tools + 2 commands
├── git.test.ts
├── parser.test.ts
├── config.test.ts
├── render.test.ts
├── reviewers/
│   ├── comments.test.ts
│   ├── tests.test.ts
│   ├── errors.test.ts
│   ├── types.test.ts
│   ├── quality.test.ts
│   └── simplification.test.ts
└── index.test.ts             # Integration tests
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `pi-extensions/my-pr-review/package.json`
- Create: `pi-extensions/my-pr-review/tsconfig.json`
- Create: `pi-extensions/my-pr-review/vitest.config.ts`
- Create: `pi-extensions/my-pr-review/my-pr-review.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "my-pr-review",
  "version": "1.0.0",
  "type": "module",
  "main": "index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@earendil-works/pi-coding-agent": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "outDir": "./dist"
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
      exclude: ["node_modules/", "index.ts", "types.ts"],
    },
  },
});
```

- [ ] **Step 4: Create default config my-pr-review.json**

```json
{
  "enabled": true,
  "ghCli": "gh",
  "worktree": {
    "enabled": true,
    "prefix": "{repo}-pr-{number}-review",
    "autoCleanup": true,
    "cleanupOnSessionEnd": true
  },
  "reviewers": {
    "review_tests": { "enabled": true },
    "review_error_handling": { "enabled": true },
    "review_code_quality": { "enabled": true },
    "review_comments": { "enabled": true },
    "review_type_design": { "enabled": true },
    "review_simplification": { "enabled": true }
  },
  "limits": {
    "maxDiffSizeKB": 500,
    "maxFilesPerReview": 100,
    "testTimeoutMs": 30000
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-pr-review/package.json pi-extensions/my-pr-review/tsconfig.json pi-extensions/my-pr-review/vitest.config.ts pi-extensions/my-pr-review/my-pr-review.json
git commit -m "chore(my-pr-review): project scaffold"
```

---

### Task 2: Shared Types and Config

**Files:**
- Create: `pi-extensions/my-pr-review/types.ts`
- Create: `pi-extensions/my-pr-review/config.ts`
- Create: `pi-extensions/my-pr-review/config.test.ts`

- [ ] **Step 1: Write failing test for config loading**

```typescript
// config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, defaultConfig } from "./config";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("loadConfig", () => {
  const testDir = join(tmpdir(), "my-pr-review-test-" + Date.now());

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns default config when file not found", () => {
    const config = loadConfig(join(testDir, "nonexistent.json"));
    expect(config.enabled).toBe(true);
    expect(config.ghCli).toBe("gh");
    expect(config.worktree.enabled).toBe(true);
  });

  it("loads and merges custom config", () => {
    const configPath = join(testDir, "my-pr-review.json");
    writeFileSync(configPath, JSON.stringify({ enabled: false, ghCli: "gh" }));
    const config = loadConfig(configPath);
    expect(config.enabled).toBe(false);
    expect(config.ghCli).toBe("gh");
    expect(config.worktree.enabled).toBe(true); // from default
  });

  it("throws on invalid JSON", () => {
    const configPath = join(testDir, "bad.json");
    writeFileSync(configPath, "not json");
    expect(() => loadConfig(configPath)).toThrow();
  });
});
```

Run: `cd pi-extensions/my-pr-review && npx vitest run config.test.ts`
Expected: FAIL — `config.ts` does not exist

- [ ] **Step 2: Create types.ts**

```typescript
// types.ts
export interface PrInfo {
  number: number;
  repo: string;
  owner: string;
  title: string;
  url: string;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffSummary {
  totalFiles: number;
  additions: number;
  deletions: number;
  changedFiles: ChangedFile[];
}

export type Severity = "info" | "warning" | "critical";

export interface ReviewFinding {
  type: string;
  file: string;
  line?: number;
  severity: Severity;
  description: string;
}

export interface ReviewResult {
  findings: ReviewFinding[];
  summary: Record<string, unknown>;
  notes?: string;
}

export interface WorktreeInfo {
  created: boolean;
  path?: string;
  branch?: string;
  base?: string;
}

export interface PrReviewConfig {
  enabled: boolean;
  ghCli: string;
  worktree: {
    enabled: boolean;
    prefix: string;
    autoCleanup: boolean;
    cleanupOnSessionEnd: boolean;
  };
  reviewers: Record<string, { enabled: boolean }>;
  limits: {
    maxDiffSizeKB: number;
    maxFilesPerReview: number;
    testTimeoutMs: number;
  };
}
```

- [ ] **Step 3: Create config.ts**

```typescript
// config.ts
import { readFileSync } from "node:fs";
import type { PrReviewConfig } from "./types";

export const defaultConfig: PrReviewConfig = {
  enabled: true,
  ghCli: "gh",
  worktree: {
    enabled: true,
    prefix: "{repo}-pr-{number}-review",
    autoCleanup: true,
    cleanupOnSessionEnd: true,
  },
  reviewers: {
    review_tests: { enabled: true },
    review_error_handling: { enabled: true },
    review_code_quality: { enabled: true },
    review_comments: { enabled: true },
    review_type_design: { enabled: true },
    review_simplification: { enabled: true },
  },
  limits: {
    maxDiffSizeKB: 500,
    maxFilesPerReview: 100,
    testTimeoutMs: 30000,
  },
};

export function loadConfig(configPath: string): PrReviewConfig {
  try {
    const raw = readFileSync(configPath, "utf-8");
    const custom = JSON.parse(raw) as Partial<PrReviewConfig>;
    return mergeConfig(defaultConfig, custom);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...defaultConfig };
    }
    throw err;
  }
}

function mergeConfig(
  base: PrReviewConfig,
  custom: Partial<PrReviewConfig>
): PrReviewConfig {
  return {
    enabled: custom.enabled ?? base.enabled,
    ghCli: custom.ghCli ?? base.ghCli,
    worktree: { ...base.worktree, ...custom.worktree },
    reviewers: { ...base.reviewers, ...custom.reviewers },
    limits: { ...base.limits, ...custom.limits },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd pi-extensions/my-pr-review && npx vitest run config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-pr-review/types.ts pi-extensions/my-pr-review/config.ts pi-extensions/my-pr-review/config.test.ts
git commit -m "feat(my-pr-review): shared types and config"
```

---

### Task 3: Diff Parser

**Files:**
- Create: `pi-extensions/my-pr-review/parser.ts`
- Create: `pi-extensions/my-pr-review/parser.test.ts`

- [ ] **Step 1: Write failing test for diff parser**

```typescript
// parser.test.ts
import { describe, it, expect } from "vitest";
import { parseDiff } from "./parser";

const sampleDiff = `diff --git a/src/auth.ts b/src/auth.ts
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/src/auth.ts
@@ -0,0 +1,10 @@
+export function login(user: string, pass: string): boolean {
+  if (user === "admin" && pass === "secret") {
+    return true;
+  }
+  return false;
+}
+diff --git a/src/api.ts b/src/api.ts
index abc1234..def5678 100644
--- a/src/api.ts
+++ b/src/api.ts
@@ -45,6 +45,7 @@ export async function fetchUser(id: string) {
   try {
     const res = await fetch(\`/api/users/\${id}\`);
     return res.json();
   } catch (e) {
+    console.error("fetch failed", e);
     return null;
   }
 }`;

describe("parseDiff", () => {
  it("parses added file", () => {
    const result = parseDiff(sampleDiff);
    const authFile = result.changedFiles.find((f) => f.path === "src/auth.ts");
    expect(authFile).toBeDefined();
    expect(authFile?.status).toBe("added");
    expect(authFile?.additions).toBe(10);
    expect(authFile?.deletions).toBe(0);
    expect(authFile?.hunks.length).toBe(1);
  });

  it("parses modified file", () => {
    const result = parseDiff(sampleDiff);
    const apiFile = result.changedFiles.find((f) => f.path === "src/api.ts");
    expect(apiFile).toBeDefined();
    expect(apiFile?.status).toBe("modified");
    expect(apiFile?.additions).toBe(1);
    expect(apiFile?.hunks.length).toBe(1);
  });

  it("calculates totals", () => {
    const result = parseDiff(sampleDiff);
    expect(result.totalFiles).toBe(2);
    expect(result.additions).toBe(11);
    expect(result.deletions).toBe(0);
  });

  it("returns empty for empty diff", () => {
    const result = parseDiff("");
    expect(result.totalFiles).toBe(0);
    expect(result.changedFiles).toEqual([]);
  });
});
```

Run: `cd pi-extensions/my-pr-review && npx vitest run parser.test.ts`
Expected: FAIL — parser.ts does not exist

- [ ] **Step 2: Create parser.ts**

```typescript
// parser.ts
import type { ChangedFile, DiffHunk, DiffSummary } from "./types";

export function parseDiff(diffText: string): DiffSummary {
  const lines = diffText.split("\n");
  const changedFiles: ChangedFile[] = [];
  let currentFile: ChangedFile | undefined;
  let currentHunk: DiffHunk | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("diff --git ")) {
      if (currentFile) {
        changedFiles.push(currentFile);
      }
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      const path = match ? match[2] : "";
      currentFile = {
        path,
        status: "modified",
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      currentHunk = undefined;
    } else if (line.startsWith("new file mode ")) {
      if (currentFile) currentFile.status = "added";
    } else if (line.startsWith("deleted file mode ")) {
      if (currentFile) currentFile.status = "deleted";
    } else if (line.startsWith("rename from ")) {
      if (currentFile) currentFile.status = "renamed";
    } else if (line.startsWith("@@ ")) {
      if (currentFile) {
        const hunk = parseHunkHeader(line);
        currentHunk = hunk;
        currentFile.hunks.push(hunk);
      }
    } else if (currentHunk && currentFile) {
      currentHunk.lines.push(line);
      if (line.startsWith("+")) {
        currentFile.additions++;
      } else if (line.startsWith("-")) {
        currentFile.deletions++;
      }
    }
  }

  if (currentFile) {
    changedFiles.push(currentFile);
  }

  return {
    totalFiles: changedFiles.length,
    additions: changedFiles.reduce((sum, f) => sum + f.additions, 0),
    deletions: changedFiles.reduce((sum, f) => sum + f.deletions, 0),
    changedFiles,
  };
}

function parseHunkHeader(line: string): DiffHunk {
  const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!match) {
    return { oldStart: 0, oldCount: 0, newStart: 0, newCount: 0, lines: [] };
  }
  return {
    oldStart: parseInt(match[1], 10),
    oldCount: parseInt(match[2] ?? "0", 10),
    newStart: parseInt(match[3], 10),
    newCount: parseInt(match[4] ?? "0", 10),
    lines: [],
  };
}
```

- [ ] **Step 3: Run tests**

Run: `cd pi-extensions/my-pr-review && npx vitest run parser.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-pr-review/parser.ts pi-extensions/my-pr-review/parser.test.ts
git commit -m "feat(my-pr-review): diff parser"
```

---

### Task 4: Git Operations

**Files:**
- Create: `pi-extensions/my-pr-review/git.ts`
- Create: `pi-extensions/my-pr-review/git.test.ts`

- [ ] **Step 1: Write failing test for git operations**

```typescript
// git.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  parsePrUrl,
  isCurrentRepo,
  buildWorktreePath,
  recommendReviewers,
} from "./git";

describe("parsePrUrl", () => {
  it("parses GitHub PR URL", () => {
    const result = parsePrUrl("https://github.com/owner/repo/pull/42");
    expect(result).toEqual({ owner: "owner", repo: "repo", number: 42 });
  });

  it("returns null for invalid URL", () => {
    expect(parsePrUrl("not-a-url")).toBeNull();
    expect(parsePrUrl("https://github.com/owner/repo/issues/42")).toBeNull();
  });
});

describe("isCurrentRepo", () => {
  it("matches when remote contains owner/repo", () => {
    const remotes = `origin  git@github.com:owner/repo.git (fetch)
origin  git@github.com:owner/repo.git (push)`;
    expect(isCurrentRepo(remotes, "owner", "repo")).toBe(true);
  });

  it("does not match different repo", () => {
    const remotes = `origin  git@github.com:other/repo.git (fetch)`;
    expect(isCurrentRepo(remotes, "owner", "repo")).toBe(false);
  });
});

describe("buildWorktreePath", () => {
  it("replaces placeholders", () => {
    const result = buildWorktreePath("{repo}-pr-{number}-review", "myrepo", 42);
    expect(result).toBe("myrepo-pr-42-review");
  });
});

describe("recommendReviewers", () => {
  it("recommends test reviewer for test files", () => {
    const files = [{ path: "src/auth.ts", status: "modified" as const, additions: 10, deletions: 0, hunks: [] },
                   { path: "src/auth.test.ts", status: "modified" as const, additions: 5, deletions: 0, hunks: [] }];
    const result = recommendReviewers(files);
    expect(result).toContain("review_tests");
  });

  it("recommends type reviewer for .d.ts files", () => {
    const files = [{ path: "src/types.d.ts", status: "added" as const, additions: 20, deletions: 0, hunks: [] }];
    const result = recommendReviewers(files);
    expect(result).toContain("review_type_design");
  });

  it("always includes quality and simplification", () => {
    const files = [{ path: "README.md", status: "modified" as const, additions: 1, deletions: 0, hunks: [] }];
    const result = recommendReviewers(files);
    expect(result).toContain("review_code_quality");
    expect(result).toContain("review_simplification");
  });
});
```

Run: `cd pi-extensions/my-pr-review && npx vitest run git.test.ts`
Expected: FAIL — git.ts does not exist

- [ ] **Step 2: Create git.ts**

```typescript
// git.ts
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";
import type { ChangedFile } from "./types";

export interface PrUrlInfo {
  owner: string;
  repo: string;
  number: number;
}

export function parsePrUrl(url: string): PrUrlInfo | null {
  const match = url.match(
    /github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/
  );
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    number: parseInt(match[3], 10),
  };
}

export function isCurrentRepo(
  remotes: string,
  owner: string,
  repo: string
): boolean {
  const patterns = [
    new RegExp(`${owner}/${repo}\\.git`),
    new RegExp(`${owner}/${repo}(?!\\w)`),
  ];
  return patterns.some((p) => p.test(remotes));
}

export function getGitRemotes(cwd: string): string {
  try {
    return execSync("git remote -v", { cwd, encoding: "utf-8" });
  } catch {
    return "";
  }
}

export function buildWorktreePath(
  prefix: string,
  repo: string,
  number: number
): string {
  return prefix.replace("{repo}", repo).replace("{number}", String(number));
}

export function createWorktree(
  cwd: string,
  worktreePath: string,
  branch: string,
  remoteBranch: string
): void {
  const absPath = resolve(cwd, "..", worktreePath);
  execSync(`git worktree add "${absPath}" "${remoteBranch}"`, {
    cwd,
    stdio: "pipe",
  });
  execSync(`git checkout -b "${branch}" "${remoteBranch}"`, {
    cwd: absPath,
    stdio: "pipe",
  });
}

export function removeWorktree(cwd: string, worktreePath: string): void {
  const absPath = resolve(cwd, "..", worktreePath);
  try {
    execSync(`git worktree remove "${absPath}" --force`, {
      cwd,
      stdio: "pipe",
    });
  } catch {
    // Best effort cleanup
  }
}

export function fetchPrDiff(
  prNumber: number,
  cwd?: string
): string {
  const cmd = `gh pr diff ${prNumber}`;
  return execSync(cmd, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

export function getPrInfo(
  prNumber: number,
  cwd?: string
): { title: string; headRefName: string; baseRefName: string } {
  const cmd = `gh pr view ${prNumber} --json title,headRefName,baseRefName`;
  const output = execSync(cmd, { cwd, encoding: "utf-8" });
  return JSON.parse(output);
}

export function checkGhInstalled(): boolean {
  try {
    execSync("gh --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function hasUncommittedChanges(cwd: string): boolean {
  try {
    const output = execSync("git status --porcelain", {
      cwd,
      encoding: "utf-8",
    });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

export function recommendReviewers(files: ChangedFile[]): string[] {
  const reviewers = new Set<string>();
  const paths = files.map((f) => f.path);

  if (paths.some((p) => /\.(test|spec)\./.test(p) || /test/.test(p))) {
    reviewers.add("review_tests");
  }

  if (paths.some((p) => /\.(ts|js|tsx|jsx)$/.test(p))) {
    reviewers.add("review_error_handling");
    reviewers.add("review_code_quality");
    reviewers.add("review_simplification");
  }

  if (paths.some((p) => /\.(d\.ts|\.ts|\.tsx)$/.test(p))) {
    reviewers.add("review_type_design");
  }

  if (paths.some((p) => /\.(ts|js|tsx|jsx|py|rs|go)$/.test(p))) {
    reviewers.add("review_comments");
  }

  // Always include these for code files
  if (paths.some((p) => /\.(ts|js|tsx|jsx|py|rs|go|java)$/.test(p))) {
    reviewers.add("review_code_quality");
    reviewers.add("review_simplification");
  }

  return Array.from(reviewers);
}
```

- [ ] **Step 3: Run tests**

Run: `cd pi-extensions/my-pr-review && npx vitest run git.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-pr-review/git.ts pi-extensions/my-pr-review/git.test.ts
git commit -m "feat(my-pr-review): git operations and PR utilities"
```

---

### Task 5: Reviewers — Comments

**Files:**
- Create: `pi-extensions/my-pr-review/reviewers/comments.ts`
- Create: `pi-extensions/my-pr-review/reviewers/comments.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// reviewers/comments.test.ts
import { describe, it, expect } from "vitest";
import { reviewComments } from "./comments";
import type { ChangedFile } from "../types";

describe("reviewComments", () => {
  it("finds inaccurate comments", () => {
    const files: ChangedFile[] = [
      {
        path: "src/auth.ts",
        status: "modified",
        additions: 5,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 5,
            lines: [
              "+// Returns user name",
              "+export function getUser(): string {",
              "+  return 42;",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewComments(files);
    const finding = result.findings.find(
      (f) => f.type === "inaccurate-comment"
    );
    expect(finding).toBeDefined();
    expect(finding?.file).toBe("src/auth.ts");
    expect(finding?.severity).toBe("warning");
  });

  it("flags missing comments on exported functions", () => {
    const files: ChangedFile[] = [
      {
        path: "src/utils.ts",
        status: "added",
        additions: 3,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 3,
            lines: [
              "+export function complexCalc(a: number, b: number) {",
              "+  return a * b + Math.sqrt(a);",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewComments(files);
    const finding = result.findings.find((f) => f.type === "missing-comment");
    expect(finding).toBeDefined();
  });

  it("returns empty for no issues", () => {
    const files: ChangedFile[] = [];
    const result = reviewComments(files);
    expect(result.findings).toEqual([]);
  });
});
```

Run: `cd pi-extensions/my-pr-review && npx vitest run reviewers/comments.test.ts`
Expected: FAIL

- [ ] **Step 2: Create comments.ts**

```typescript
// reviewers/comments.ts
import type { ChangedFile, ReviewFinding, ReviewResult } from "../types";

export function reviewComments(files: ChangedFile[]): ReviewResult {
  const findings: ReviewFinding[] = [];

  for (const file of files) {
    if (!/\.(ts|js|tsx|jsx|py|rs|go|java)$/.test(file.path)) continue;

    const addedLines = extractAddedLines(file);

    for (let i = 0; i < addedLines.length; i++) {
      const line = addedLines[i];
      const lineNumber = estimateLineNumber(file, i);

      // Check for inaccurate comments
      if (line.text.trim().startsWith("//") || line.text.trim().startsWith("/*")) {
        const commentText = line.text.toLowerCase();
        const nextLines = addedLines.slice(i + 1, i + 5);
        const codeText = nextLines.map((l) => l.text.toLowerCase()).join(" ");

        if (commentText.includes("returns string") && codeText.includes("return 42")) {
          findings.push({
            type: "inaccurate-comment",
            file: file.path,
            line: lineNumber,
            severity: "warning",
            description: `Comment says "returns string" but function returns number`,
          });
        }
      }

      // Check for exported functions without comments
      const exportMatch = line.text.match(/export\s+(?:async\s+)?function\s+(\w+)/);
      if (exportMatch) {
        const funcName = exportMatch[1];
        const prevLines = addedLines.slice(Math.max(0, i - 3), i);
        const hasComment = prevLines.some(
          (l) => l.text.trim().startsWith("//") || l.text.trim().startsWith("/*")
        );
        if (!hasComment) {
          findings.push({
            type: "missing-comment",
            file: file.path,
            line: lineNumber,
            severity: "info",
            description: `Exported function \`${funcName}\` lacks a comment/docstring`,
          });
        }
      }
    }
  }

  return {
    findings,
    summary: {
      totalFilesChecked: files.length,
      inaccurateComments: findings.filter((f) => f.type === "inaccurate-comment").length,
      missingComments: findings.filter((f) => f.type === "missing-comment").length,
    },
  };
}

function extractAddedLines(file: ChangedFile): Array<{ text: string; hunkIndex: number }> {
  const lines: Array<{ text: string; hunkIndex: number }> = [];
  for (let hi = 0; hi < file.hunks.length; hi++) {
    const hunk = file.hunks[hi];
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        lines.push({ text: line.slice(1), hunkIndex: hi });
      }
    }
  }
  return lines;
}

function estimateLineNumber(file: ChangedFile, addedLineIndex: number): number {
  let count = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        if (count === addedLineIndex) {
          return hunk.newStart + count;
        }
        count++;
      }
    }
  }
  return 0;
}
```

- [ ] **Step 3: Run tests**

Run: `cd pi-extensions/my-pr-review && npx vitest run reviewers/comments.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-pr-review/reviewers/comments.ts pi-extensions/my-pr-review/reviewers/comments.test.ts
git commit -m "feat(my-pr-review): comment reviewer"
```

---

### Task 6: Reviewers — Tests

**Files:**
- Create: `pi-extensions/my-pr-review/reviewers/tests.ts`
- Create: `pi-extensions/my-pr-review/reviewers/tests.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// reviewers/tests.test.ts
import { describe, it, expect } from "vitest";
import { reviewTests } from "./tests";
import type { ChangedFile } from "../types";

describe("reviewTests", () => {
  it("finds missing tests for new source files", () => {
    const files: ChangedFile[] = [
      {
        path: "src/auth.ts",
        status: "added",
        additions: 20,
        deletions: 0,
        hunks: [],
      },
    ];

    const result = reviewTests(files);
    const finding = result.findings.find((f) => f.type === "missing-test");
    expect(finding).toBeDefined();
    expect(finding?.file).toBe("src/auth.ts");
    expect(finding?.severity).toBe("warning");
  });

  it("recognizes matching test file", () => {
    const files: ChangedFile[] = [
      {
        path: "src/auth.ts",
        status: "modified",
        additions: 5,
        deletions: 0,
        hunks: [],
      },
      {
        path: "src/auth.test.ts",
        status: "modified",
        additions: 10,
        deletions: 0,
        hunks: [],
      },
    ];

    const result = reviewTests(files);
    const missing = result.findings.find((f) => f.type === "missing-test");
    expect(missing).toBeUndefined();
  });

  it("finds uncovered changes", () => {
    const files: ChangedFile[] = [
      {
        path: "src/utils.ts",
        status: "modified",
        additions: 15,
        deletions: 0,
        hunks: [],
      },
      {
        path: "src/auth.test.ts",
        status: "modified",
        additions: 5,
        deletions: 0,
        hunks: [],
      },
    ];

    const result = reviewTests(files);
    const uncovered = result.findings.find((f) => f.type === "uncovered-change");
    expect(uncovered).toBeDefined();
    expect(uncovered?.file).toBe("src/utils.ts");
  });
});
```

Run: `cd pi-extensions/my-pr-review && npx vitest run reviewers/tests.test.ts`
Expected: FAIL

- [ ] **Step 2: Create tests.ts**

```typescript
// reviewers/tests.ts
import type { ChangedFile, ReviewFinding, ReviewResult } from "../types";

export function reviewTests(files: ChangedFile[]): ReviewResult {
  const findings: ReviewFinding[] = [];
  const testFiles = files.filter((f) => isTestFile(f.path));
  const sourceFiles = files.filter(
    (f) => isSourceFile(f.path) && !isTestFile(f.path)
  );

  for (const source of sourceFiles) {
    const baseName = getBaseName(source.path);
    const hasTest = testFiles.some((t) => {
      const testBase = getBaseName(t.path);
      return testBase === baseName || t.path.includes(baseName);
    });

    if (!hasTest) {
      findings.push({
        type: "missing-test",
        file: source.path,
        severity: source.status === "added" ? "warning" : "info",
        description:
          source.status === "added"
            ? `New file \`${source.path}\` has no corresponding test`
            : `Modified file \`${source.path}\` has no test updates`,
      });
    }
  }

  for (const source of sourceFiles) {
    if (source.status !== "modified") continue;
    const baseName = getBaseName(source.path);
    const hasTestUpdate = testFiles.some((t) => {
      const testBase = getBaseName(t.path);
      return (testBase === baseName || t.path.includes(baseName)) && t.additions > 0;
    });

    if (!hasTestUpdate && source.additions > 0) {
      findings.push({
        type: "uncovered-change",
        file: source.path,
        severity: "info",
        description: `Changes in \`${source.path}\` not reflected in tests`,
      });
    }
  }

  return {
    findings,
    summary: {
      testFiles: testFiles.length,
      sourceFiles: sourceFiles.length,
      missingTests: findings.filter((f) => f.type === "missing-test").length,
      uncoveredChanges: findings.filter((f) => f.type === "uncovered-change").length,
    },
  };
}

function isTestFile(path: string): boolean {
  return /\.(test|spec)\./.test(path) || /[\/_]test[\/_]/.test(path);
}

function isSourceFile(path: string): boolean {
  return /\.(ts|js|tsx|jsx|py|rs|go|java)$/.test(path);
}

function getBaseName(path: string): string {
  return path
    .replace(/\.(test|spec)\.(ts|js|tsx|jsx)$/, "")
    .replace(/\.[^.]+$/, "");
}
```

- [ ] **Step 3: Run tests**

Run: `cd pi-extensions/my-pr-review && npx vitest run reviewers/tests.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-pr-review/reviewers/tests.ts pi-extensions/my-pr-review/reviewers/tests.test.ts
git commit -m "feat(my-pr-review): test coverage reviewer"
```

---

### Task 7: Reviewers — Error Handling

**Files:**
- Create: `pi-extensions/my-pr-review/reviewers/errors.ts`
- Create: `pi-extensions/my-pr-review/reviewers/errors.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// reviewers/errors.test.ts
import { describe, it, expect } from "vitest";
import { reviewErrors } from "./errors";
import type { ChangedFile } from "../types";

describe("reviewErrors", () => {
  it("finds empty catch blocks", () => {
    const files: ChangedFile[] = [
      {
        path: "src/api.ts",
        status: "modified",
        additions: 5,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 5,
            lines: [
              "+try {",
              "+  await fetch('/api');",
              "+} catch (e) {",
              "+  // ignore",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewErrors(files);
    const finding = result.findings.find((f) => f.type === "empty-catch");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("critical");
  });

  it("finds bare throws", () => {
    const files: ChangedFile[] = [
      {
        path: "src/utils.ts",
        status: "modified",
        additions: 3,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 3,
            lines: ["+if (!valid) {", "+  throw 'invalid';", "+}"],
          },
        ],
      },
    ];

    const result = reviewErrors(files);
    const finding = result.findings.find((f) => f.type === "bare-throw");
    expect(finding).toBeDefined();
  });

  it("counts try/catch occurrences", () => {
    const files: ChangedFile[] = [
      {
        path: "src/api.ts",
        status: "modified",
        additions: 5,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 5,
            lines: [
              "+try {",
              "+  await fetch('/api');",
              "+} catch (e) {",
              "+  console.error(e);",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewErrors(files);
    expect(result.summary.tryCatchCount).toBe(1);
    expect(result.summary.emptyCatchCount).toBe(0);
  });
});
```

Run: `cd pi-extensions/my-pr-review && npx vitest run reviewers/errors.test.ts`
Expected: FAIL

- [ ] **Step 2: Create errors.ts**

```typescript
// reviewers/errors.ts
import type { ChangedFile, ReviewFinding, ReviewResult } from "../types";

export function reviewErrors(files: ChangedFile[]): ReviewResult {
  const findings: ReviewFinding[] = [];
  let tryCatchCount = 0;
  let emptyCatchCount = 0;
  let bareThrowCount = 0;
  let promiseUncaught = 0;

  for (const file of files) {
    if (!/\.(ts|js|tsx|jsx)$/.test(file.path)) continue;

    const addedLines = extractAddedLines(file);

    for (let i = 0; i < addedLines.length; i++) {
      const line = addedLines[i];
      const lineNumber = estimateLineNumber(file, i);

      if (/\btry\b/.test(line)) {
        tryCatchCount++;
      }

      if (/\bcatch\s*\(/.test(line)) {
        const catchBody = getCatchBody(addedLines, i);
        if (isEmptyCatch(catchBody)) {
          emptyCatchCount++;
          findings.push({
            type: "empty-catch",
            file: file.path,
            line: lineNumber,
            severity: "critical",
            description: `Empty catch block silently swallows error`,
          });
        }
      }

      if (/throw\s+['"]/.test(line)) {
        bareThrowCount++;
        findings.push({
          type: "bare-throw",
          file: file.path,
          line: lineNumber,
          severity: "warning",
          description: `Throwing a string instead of an Error object`,
        });
      }

      if (/\.then\s*\([^)]*\)\s*$/.test(line) && !addedLines.slice(i, i + 5).some((l) => /\.catch/.test(l))) {
        promiseUncaught++;
        findings.push({
          type: "uncaught-promise",
          file: file.path,
          line: lineNumber,
          severity: "warning",
          description: `Promise chain without .catch() handler`,
        });
      }
    }
  }

  return {
    findings,
    summary: {
      tryCatchCount,
      emptyCatchCount,
      bareThrowCount,
      promiseUncaught,
    },
  };
}

function extractAddedLines(file: ChangedFile): string[] {
  const lines: string[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        lines.push(line.slice(1));
      }
    }
  }
  return lines;
}

function getCatchBody(lines: string[], catchIndex: number): string[] {
  const body: string[] = [];
  let depth = 0;
  let started = false;
  for (let i = catchIndex; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("{")) {
      started = true;
      depth++;
    }
    if (started) {
      body.push(line);
      if (line.includes("}")) {
        depth--;
        if (depth === 0) break;
      }
    }
  }
  return body;
}

function isEmptyCatch(body: string[]): boolean {
  const content = body
    .slice(1, -1)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("//"));
  return content.length === 0;
}

function estimateLineNumber(file: ChangedFile, addedLineIndex: number): number {
  let count = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        if (count === addedLineIndex) {
          return hunk.newStart + count;
        }
        count++;
      }
    }
  }
  return 0;
}
```

- [ ] **Step 3: Run tests**

Run: `cd pi-extensions/my-pr-review && npx vitest run reviewers/errors.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-pr-review/reviewers/errors.ts pi-extensions/my-pr-review/reviewers/errors.test.ts
git commit -m "feat(my-pr-review): error handling reviewer"
```

---

### Task 8: Reviewers — Type Design

**Files:**
- Create: `pi-extensions/my-pr-review/reviewers/types.ts`
- Create: `pi-extensions/my-pr-review/reviewers/types.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// reviewers/types.test.ts
import { describe, it, expect } from "vitest";
import { reviewTypes } from "./types";
import type { ChangedFile } from "../types";

describe("reviewTypes", () => {
  it("finds any usage", () => {
    const files: ChangedFile[] = [
      {
        path: "src/api.ts",
        status: "modified",
        additions: 3,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 3,
            lines: [
              "+export function process(data: any): any {",
              "+  return data;",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewTypes(files);
    const finding = result.findings.find((f) => f.type === "implicit-any");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("warning");
  });

  it("flags missing return type on exported function", () => {
    const files: ChangedFile[] = [
      {
        path: "src/utils.ts",
        status: "modified",
        additions: 3,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 3,
            lines: [
              "+export function parse(input: string) {",
              "+  return JSON.parse(input);",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewTypes(files);
    const finding = result.findings.find((f) => f.type === "missing-return-type");
    expect(finding).toBeDefined();
  });

  it("returns empty for non-ts files", () => {
    const files: ChangedFile[] = [
      {
        path: "README.md",
        status: "modified",
        additions: 1,
        deletions: 0,
        hunks: [{ oldStart: 1, oldCount: 0, newStart: 1, newCount: 1, lines: ["+# Hello"] }],
      },
    ];

    const result = reviewTypes(files);
    expect(result.findings).toEqual([]);
  });
});
```

Run: `cd pi-extensions/my-pr-review && npx vitest run reviewers/types.test.ts`
Expected: FAIL

- [ ] **Step 2: Create types.ts**

```typescript
// reviewers/types.ts
import type { ChangedFile, ReviewFinding, ReviewResult } from "../types";

export function reviewTypes(files: ChangedFile[]): ReviewResult {
  const findings: ReviewFinding[] = [];
  let newTypes = 0;
  let modifiedTypes = 0;

  for (const file of files) {
    if (!/\.(ts|tsx|d\.ts)$/.test(file.path)) continue;

    const addedLines = extractAddedLines(file);

    for (let i = 0; i < addedLines.length; i++) {
      const line = addedLines[i];
      const lineNumber = estimateLineNumber(file, i);

      if (/\btype\s+\w+/.test(line) || /\binterface\s+\w+/.test(line)) {
        if (file.status === "added") {
          newTypes++;
        } else {
          modifiedTypes++;
        }
      }

      if (/:\s*any\b/.test(line)) {
        findings.push({
          type: "implicit-any",
          file: file.path,
          line: lineNumber,
          severity: "warning",
          description: `Usage of \`any\` type reduces type safety`,
        });
      }

      const funcMatch = line.match(
        /export\s+(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*[^:{]/
      );
      if (funcMatch) {
        findings.push({
          type: "missing-return-type",
          file: file.path,
          line: lineNumber,
          severity: "info",
          description: `Exported function \`${funcMatch[1]}\` lacks explicit return type`,
        });
      }
    }
  }

  return {
    findings,
    summary: {
      newTypes,
      modifiedTypes,
      anyUsages: findings.filter((f) => f.type === "implicit-any").length,
    },
  };
}

function extractAddedLines(file: ChangedFile): string[] {
  const lines: string[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        lines.push(line.slice(1));
      }
    }
  }
  return lines;
}

function estimateLineNumber(file: ChangedFile, addedLineIndex: number): number {
  let count = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        if (count === addedLineIndex) {
          return hunk.newStart + count;
        }
        count++;
      }
    }
  }
  return 0;
}
```

- [ ] **Step 3: Run tests**

Run: `cd pi-extensions/my-pr-review && npx vitest run reviewers/types.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-pr-review/reviewers/types.ts pi-extensions/my-pr-review/reviewers/types.test.ts
git commit -m "feat(my-pr-review): type design reviewer"
```

---

### Task 9: Reviewers — Code Quality

**Files:**
- Create: `pi-extensions/my-pr-review/reviewers/quality.ts`
- Create: `pi-extensions/my-pr-review/reviewers/quality.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// reviewers/quality.test.ts
import { describe, it, expect } from "vitest";
import { reviewQuality } from "./quality";
import type { ChangedFile } from "../types";

describe("reviewQuality", () => {
  it("flags functions with high cyclomatic complexity", () => {
    const files: ChangedFile[] = [
      {
        path: "src/logic.ts",
        status: "modified",
        additions: 20,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 20,
            lines: [
              "+export function decide(a, b, c, d) {",
              "+  if (a) {",
              "+    if (b) return 1;",
              "+    else if (c) return 2;",
              "+    else if (d) return 3;",
              "+  } else if (b) {",
              "+    if (c) return 4;",
              "+    else return 5;",
              "+  } else {",
              "+    return 6;",
              "+  }",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewQuality(files);
    const finding = result.findings.find((f) => f.type === "high-complexity");
    expect(finding).toBeDefined();
  });

  it("flags console.log in production code", () => {
    const files: ChangedFile[] = [
      {
        path: "src/api.ts",
        status: "modified",
        additions: 3,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 3,
            lines: [
              "+export function fetch() {",
              "+  console.log('fetching');",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewQuality(files);
    const finding = result.findings.find((f) => f.type === "debug-log");
    expect(finding).toBeDefined();
  });

  it("returns empty for clean code", () => {
    const files: ChangedFile[] = [
      {
        path: "src/clean.ts",
        status: "modified",
        additions: 3,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 3,
            lines: [
              "+export function add(a: number, b: number): number {",
              "+  return a + b;",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewQuality(files);
    expect(result.findings).toEqual([]);
  });
});
```

Run: `cd pi-extensions/my-pr-review && npx vitest run reviewers/quality.test.ts`
Expected: FAIL

- [ ] **Step 2: Create quality.ts**

```typescript
// reviewers/quality.ts
import type { ChangedFile, ReviewFinding, ReviewResult } from "../types";

export function reviewQuality(files: ChangedFile[]): ReviewResult {
  const findings: ReviewFinding[] = [];

  for (const file of files) {
    if (!/\.(ts|js|tsx|jsx|py|rs|go|java)$/.test(file.path)) continue;

    const addedLines = extractAddedLines(file);

    for (let i = 0; i < addedLines.length; i++) {
      const line = addedLines[i];
      const lineNumber = estimateLineNumber(file, i);

      if (/console\.(log|warn|error|debug)\(/.test(line)) {
        findings.push({
          type: "debug-log",
          file: file.path,
          line: lineNumber,
          severity: "info",
          description: `Console log statement in production code`,
        });
      }

      if (/debugger;/.test(line)) {
        findings.push({
          type: "debugger-statement",
          file: file.path,
          line: lineNumber,
          severity: "warning",
          description: `Debugger statement should be removed`,
        });
      }
    }

    // Check function complexity
    const functions = extractFunctions(addedLines);
    for (const func of functions) {
      const complexity = calculateComplexity(func.body);
      if (complexity > 10) {
        findings.push({
          type: "high-complexity",
          file: file.path,
          line: func.line,
          severity: "warning",
          description: `Function \`${func.name}\` has cyclomatic complexity of ${complexity} (>10)`,
        });
      }
    }
  }

  return {
    findings,
    summary: {
      debugLogs: findings.filter((f) => f.type === "debug-log").length,
      debuggerStatements: findings.filter((f) => f.type === "debugger-statement").length,
      highComplexity: findings.filter((f) => f.type === "high-complexity").length,
    },
  };
}

function extractAddedLines(file: ChangedFile): string[] {
  const lines: string[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        lines.push(line.slice(1));
      }
    }
  }
  return lines;
}

interface FunctionBlock {
  name: string;
  line: number;
  body: string[];
}

function extractFunctions(lines: string[]): FunctionBlock[] {
  const functions: FunctionBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (match) {
      const body = extractFunctionBody(lines, i);
      functions.push({ name: match[1], line: i + 1, body });
    }
  }
  return functions;
}

function extractFunctionBody(lines: string[], startIndex: number): string[] {
  const body: string[] = [];
  let depth = 0;
  let started = false;
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("{")) {
      started = true;
      depth += (line.match(/{/g) || []).length;
    }
    if (started) {
      body.push(line);
      depth -= (line.match(/}/g) || []).length;
      if (depth <= 0) break;
    }
  }
  return body;
}

function calculateComplexity(lines: string[]): number {
  let complexity = 1;
  for (const line of lines) {
    if (/\bif\b/.test(line)) complexity++;
    if (/\belse\s+if\b/.test(line)) complexity++;
    if (/\bwhile\b/.test(line)) complexity++;
    if (/\bfor\b/.test(line)) complexity++;
    if (/\bcase\b/.test(line)) complexity++;
    if (/\?\s*[^:]+:/.test(line)) complexity++;
    if (/\|\||\&\&/.test(line)) complexity++;
  }
  return complexity;
}

function estimateLineNumber(file: ChangedFile, addedLineIndex: number): number {
  let count = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        if (count === addedLineIndex) {
          return hunk.newStart + count;
        }
        count++;
      }
    }
  }
  return 0;
}
```

- [ ] **Step 3: Run tests**

Run: `cd pi-extensions/my-pr-review && npx vitest run reviewers/quality.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-pr-review/reviewers/quality.ts pi-extensions/my-pr-review/reviewers/quality.test.ts
git commit -m "feat(my-pr-review): code quality reviewer"
```

---

### Task 10: Reviewers — Simplification

**Files:**
- Create: `pi-extensions/my-pr-review/reviewers/simplification.ts`
- Create: `pi-extensions/my-pr-review/reviewers/simplification.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// reviewers/simplification.test.ts
import { describe, it, expect } from "vitest";
import { reviewSimplification } from "./simplification";
import type { ChangedFile } from "../types";

describe("reviewSimplification", () => {
  it("flags long functions", () => {
    const lines = Array.from({ length: 60 }, (_, i) => `+  line${i}();`);
    lines.unshift("+export function longFunc() {");
    lines.push("+}");

    const files: ChangedFile[] = [
      {
        path: "src/big.ts",
        status: "modified",
        additions: 62,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 62,
            lines,
          },
        ],
      },
    ];

    const result = reviewSimplification(files);
    const finding = result.findings.find((f) => f.type === "long-function");
    expect(finding).toBeDefined();
  });

  it("flags deep nesting", () => {
    const files: ChangedFile[] = [
      {
        path: "src/nested.ts",
        status: "modified",
        additions: 10,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 10,
            lines: [
              "+if (a) {",
              "+  if (b) {",
              "+    if (c) {",
              "+      if (d) {",
              "+        if (e) {",
              "+          doSomething();",
              "+        }",
              "+      }",
              "+    }",
              "+  }",
            ],
          },
        ],
      },
    ];

    const result = reviewSimplification(files);
    const finding = result.findings.find((f) => f.type === "deep-nesting");
    expect(finding).toBeDefined();
  });

  it("flags duplicated code blocks", () => {
    const files: ChangedFile[] = [
      {
        path: "src/dup.ts",
        status: "modified",
        additions: 8,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 8,
            lines: [
              "+const x = a + b;",
              "+const y = x * 2;",
              "+return y;",
              "+}",
              "+const x = a + b;",
              "+const y = x * 2;",
              "+return y;",
              "+}",
            ],
          },
        ],
      },
    ];

    const result = reviewSimplification(files);
    const finding = result.findings.find((f) => f.type === "duplicate-code");
    expect(finding).toBeDefined();
  });
});
```

Run: `cd pi-extensions/my-pr-review && npx vitest run reviewers/simplification.test.ts`
Expected: FAIL

- [ ] **Step 2: Create simplification.ts**

```typescript
// reviewers/simplification.ts
import type { ChangedFile, ReviewFinding, ReviewResult } from "../types";

export function reviewSimplification(files: ChangedFile[]): ReviewResult {
  const findings: ReviewFinding[] = [];

  for (const file of files) {
    if (!/\.(ts|js|tsx|jsx|py|rs|go|java)$/.test(file.path)) continue;

    const addedLines = extractAddedLines(file);

    // Check for long functions
    const functions = extractFunctions(addedLines);
    for (const func of functions) {
      if (func.body.length > 50) {
        findings.push({
          type: "long-function",
          file: file.path,
          line: func.line,
          severity: "info",
          description: `Function \`${func.name}\` is ${func.body.length} lines long. Consider extracting helpers.`,
        });
      }
    }

    // Check for deep nesting
    const maxDepth = calculateMaxNestingDepth(addedLines);
    if (maxDepth > 4) {
      findings.push({
        type: "deep-nesting",
        file: file.path,
        line: 1,
        severity: "warning",
        description: `Code has nesting depth of ${maxDepth}. Consider early returns or extracting functions.`,
      });
    }

    // Check for duplicate code blocks (simple heuristic: 3+ consecutive identical lines)
    const duplicates = findDuplicateBlocks(addedLines);
    for (const dup of duplicates) {
      findings.push({
        type: "duplicate-code",
        file: file.path,
        line: dup.line,
        severity: "info",
        description: `Duplicate block of ${dup.length} lines detected. Consider extracting to a function.`,
      });
    }
  }

  return {
    findings,
    summary: {
      longFunctions: findings.filter((f) => f.type === "long-function").length,
      deepNesting: findings.filter((f) => f.type === "deep-nesting").length,
      duplicateBlocks: findings.filter((f) => f.type === "duplicate-code").length,
    },
  };
}

function extractAddedLines(file: ChangedFile): string[] {
  const lines: string[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        lines.push(line.slice(1));
      }
    }
  }
  return lines;
}

interface FunctionBlock {
  name: string;
  line: number;
  body: string[];
}

function extractFunctions(lines: string[]): FunctionBlock[] {
  const functions: FunctionBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (match) {
      const body = extractFunctionBody(lines, i);
      functions.push({ name: match[1], line: i + 1, body });
    }
  }
  return functions;
}

function extractFunctionBody(lines: string[], startIndex: number): string[] {
  const body: string[] = [];
  let depth = 0;
  let started = false;
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("{")) {
      started = true;
      depth += (line.match(/{/g) || []).length;
    }
    if (started) {
      body.push(line);
      depth -= (line.match(/}/g) || []).length;
      if (depth <= 0) break;
    }
  }
  return body;
}

function calculateMaxNestingDepth(lines: string[]): number {
  let maxDepth = 0;
  let currentDepth = 0;
  for (const line of lines) {
    const openCount = (line.match(/[{(]/g) || []).length;
    const closeCount = (line.match(/[})]/g) || []).length;
    currentDepth += openCount - closeCount;
    maxDepth = Math.max(maxDepth, currentDepth);
  }
  return maxDepth;
}

interface DuplicateBlock {
  line: number;
  length: number;
}

function findDuplicateBlocks(lines: string[]): DuplicateBlock[] {
  const duplicates: DuplicateBlock[] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i <= lines.length - 3; i++) {
    const block = lines.slice(i, i + 3).join("\n");
    const trimmed = block.replace(/\s+/g, " ").trim();
    if (seen.has(trimmed)) {
      duplicates.push({ line: i + 1, length: 3 });
    } else {
      seen.set(trimmed, i);
    }
  }

  return duplicates;
}
```

- [ ] **Step 3: Run tests**

Run: `cd pi-extensions/my-pr-review && npx vitest run reviewers/simplification.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-pr-review/reviewers/simplification.ts pi-extensions/my-pr-review/reviewers/simplification.test.ts
git commit -m "feat(my-pr-review): simplification reviewer"
```

---

### Task 11: TUI Renderer

**Files:**
- Create: `pi-extensions/my-pr-review/render.ts`
- Create: `pi-extensions/my-pr-review/render.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// render.test.ts
import { describe, it, expect } from "vitest";
import { severityIcon, formatFinding, formatReviewResult } from "./render";
import type { ReviewFinding, ReviewResult } from "./types";

describe("severityIcon", () => {
  it("returns correct icons", () => {
    expect(severityIcon("info")).toBe("ℹ");
    expect(severityIcon("warning")).toBe("⚠");
    expect(severityIcon("critical")).toBe("✗");
  });
});

describe("formatFinding", () => {
  it("formats finding with line number", () => {
    const finding: ReviewFinding = {
      type: "test",
      file: "src/a.ts",
      line: 42,
      severity: "warning",
      description: "Something is wrong",
    };
    expect(formatFinding(finding)).toBe("⚠ src/a.ts:42 — Something is wrong");
  });

  it("formats finding without line number", () => {
    const finding: ReviewFinding = {
      type: "test",
      file: "src/a.ts",
      severity: "info",
      description: "Note",
    };
    expect(formatFinding(finding)).toBe("ℹ src/a.ts — Note");
  });
});

describe("formatReviewResult", () => {
  it("formats result with findings", () => {
    const result: ReviewResult = {
      findings: [
        { type: "a", file: "f.ts", severity: "warning", description: "d1" },
        { type: "b", file: "f.ts", severity: "info", description: "d2" },
      ],
      summary: { count: 2 },
    };
    const formatted = formatReviewResult(result, "Test");
    expect(formatted).toContain("Test");
    expect(formatted).toContain("⚠ f.ts — d1");
    expect(formatted).toContain("ℹ f.ts — d2");
  });
});
```

Run: `cd pi-extensions/my-pr-review && npx vitest run render.test.ts`
Expected: FAIL

- [ ] **Step 2: Create render.ts**

```typescript
// render.ts
import type { ReviewFinding, ReviewResult } from "./types";

export function severityIcon(severity: string): string {
  switch (severity) {
    case "info":
      return "ℹ";
    case "warning":
      return "⚠";
    case "critical":
      return "✗";
    default:
      return "•";
  }
}

export function formatFinding(finding: ReviewFinding): string {
  const icon = severityIcon(finding.severity);
  const location = finding.line
    ? `${finding.file}:${finding.line}`
    : finding.file;
  return `${icon} ${location} — ${finding.description}`;
}

export function formatReviewResult(
  result: ReviewResult,
  title: string
): string {
  const lines: string[] = [`### ${title}`];

  if (result.findings.length === 0) {
    lines.push("✓ No issues found");
    return lines.join("\n");
  }

  for (const finding of result.findings) {
    lines.push(formatFinding(finding));
  }

  if (result.notes) {
    lines.push(`\n_Note: ${result.notes}_`);
  }

  return lines.join("\n");
}

export function renderSeverityForTui(severity: string): string {
  switch (severity) {
    case "critical":
      return "critical";
    case "warning":
      return "warning";
    case "info":
      return "info";
    default:
      return "muted";
  }
}
```

- [ ] **Step 3: Run tests**

Run: `cd pi-extensions/my-pr-review && npx vitest run render.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-pr-review/render.ts pi-extensions/my-pr-review/render.test.ts
git commit -m "feat(my-pr-review): TUI renderer"
```

---

### Task 12: Main Extension Entry Point

**Files:**
- Create: `pi-extensions/my-pr-review/index.ts`
- Create: `pi-extensions/my-pr-review/index.test.ts`

- [ ] **Step 1: Write failing integration test**

```typescript
// index.test.ts
import { describe, it, expect, vi } from "vitest";
import myPrReview from "./index";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

describe("myPrReview", () => {
  it("registers 8 tools", () => {
    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: vi.fn(),
      on: vi.fn(),
    } as unknown as ExtensionAPI;

    myPrReview(mockPi);

    const toolCalls = vi.mocked(mockPi.registerTool).mock.calls;
    expect(toolCalls.length).toBe(8);

    const toolNames = toolCalls.map((c) => c[0].name);
    expect(toolNames).toContain("review_pr");
    expect(toolNames).toContain("review_tests");
    expect(toolNames).toContain("review_error_handling");
    expect(toolNames).toContain("review_code_quality");
    expect(toolNames).toContain("review_comments");
    expect(toolNames).toContain("review_type_design");
    expect(toolNames).toContain("review_simplification");
    expect(toolNames).toContain("save_review");
  });

  it("registers 2 commands", () => {
    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: vi.fn(),
      on: vi.fn(),
    } as unknown as ExtensionAPI;

    myPrReview(mockPi);

    const cmdCalls = vi.mocked(mockPi.registerCommand).mock.calls;
    expect(cmdCalls.length).toBe(2);

    const cmdNames = cmdCalls.map((c) => c[0]);
    expect(cmdNames).toContain("review-pr");
    expect(cmdNames).toContain("review-pr-cleanup");
  });

  it("registers session_shutdown handler for cleanup", () => {
    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: vi.fn(),
      on: vi.fn(),
    } as unknown as ExtensionAPI;

    myPrReview(mockPi);

    const onCalls = vi.mocked(mockPi.on).mock.calls;
    const shutdownHandlers = onCalls.filter(
      (c) => c[0] === "session_shutdown"
    );
    expect(shutdownHandlers.length).toBe(1);
  });
});
```

Run: `cd pi-extensions/my-pr-review && npx vitest run index.test.ts`
Expected: FAIL

- [ ] **Step 2: Create index.ts**

```typescript
// index.ts
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig } from "./config";
import {
  parsePrUrl,
  isCurrentRepo,
  getGitRemotes,
  buildWorktreePath,
  createWorktree,
  removeWorktree,
  fetchPrDiff,
  getPrInfo,
  checkGhInstalled,
  hasUncommittedChanges,
  recommendReviewers,
} from "./git";
import { parseDiff } from "./parser";
import { reviewComments } from "./reviewers/comments";
import { reviewTests } from "./reviewers/tests";
import { reviewErrors } from "./reviewers/errors";
import { reviewTypes } from "./reviewers/types";
import { reviewQuality } from "./reviewers/quality";
import { reviewSimplification } from "./reviewers/simplification";
import { formatReviewResult } from "./render";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import type { ChangedFile, PrInfo, ReviewFinding, WorktreeInfo } from "./types";

const EXT_DIR = (() => {
  if (typeof __dirname !== "undefined") return __dirname;
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
})();

const CONFIG_PATH = join(EXT_DIR, "my-pr-review.json");

// Track active worktrees for cleanup
const activeWorktrees = new Map<number, string>();

export default function myPrReview(pi: ExtensionAPI): void {
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig(CONFIG_PATH);
  } catch {
    return;
  }

  if (!config.enabled) return;

  // ── Register Tools ──

  pi.registerTool({
    name: "review_pr",
    label: "Review PR",
    description:
      "Start a PR review. If the PR is for the current git repo, creates an isolated worktree branch for review. Returns diff summary and recommended reviewer tools.",
    parameters: Type.Object({
      pr_url: Type.String({
        description: "GitHub PR URL (e.g. https://github.com/owner/repo/pull/42)",
      }),
    }),
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      if (!checkGhInstalled()) {
        return {
          content: [
            {
              type: "text",
              text: "Error: gh CLI is required. Install: https://cli.github.com/",
            },
          ],
          details: { error: "gh CLI not found" },
        };
      }

      const prInfo = parsePrUrl(params.pr_url);
      if (!prInfo) {
        return {
          content: [
            { type: "text", text: "Error: Invalid PR URL format" },
          ],
          details: { error: "invalid URL" },
        };
      }

      onUpdate?.({
        content: [{ type: "text", text: `Fetching PR #${prInfo.number}...` }],
        details: { prInfo },
      });

      let worktree: WorktreeInfo = { created: false };
      let diffText: string;
      let fullPrInfo: { title: string; headRefName: string; baseRefName: string };

      try {
        fullPrInfo = getPrInfo(prInfo.number, ctx.cwd);
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching PR info: ${(err as Error).message}`,
            },
          ],
          details: { error: (err as Error).message },
        };
      }

      // Check if current repo matches PR repo
      const remotes = getGitRemotes(ctx.cwd);
      const isLocalRepo = isCurrentRepo(remotes, prInfo.owner, prInfo.repo);

      if (isLocalRepo && config.worktree.enabled) {
        if (hasUncommittedChanges(ctx.cwd)) {
          return {
            content: [
              {
                type: "text",
                text: "Warning: Uncommitted changes detected. Stash or commit before creating worktree.",
              },
            ],
            details: { warning: "uncommitted changes" },
          };
        }

        const worktreePath = buildWorktreePath(
          config.worktree.prefix,
          prInfo.repo,
          prInfo.number
        );

        try {
          createWorktree(
            ctx.cwd,
            worktreePath,
            `review/pr-${prInfo.number}`,
            `origin/${fullPrInfo.headRefName}`
          );
          worktree = {
            created: true,
            path: join(ctx.cwd, "..", worktreePath),
            branch: `review/pr-${prInfo.number}`,
            base: `origin/${fullPrInfo.baseRefName}`,
          };
          activeWorktrees.set(prInfo.number, worktreePath);
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: `Error creating worktree: ${(err as Error).message}`,
              },
            ],
            details: { error: (err as Error).message },
          };
        }

        diffText = fetchPrDiff(prInfo.number, worktree.path);
      } else {
        diffText = fetchPrDiff(prInfo.number);
      }

      const diffSummary = parseDiff(diffText);
      const recommendedReviewers = recommendReviewers(diffSummary.changedFiles);

      return {
        content: [
          {
            type: "text",
            text: `PR #${prInfo.number}: ${fullPrInfo.title}\n${diffSummary.totalFiles} files changed (+${diffSummary.additions}/-${diffSummary.deletions})`,
          },
        ],
        details: {
          pr_info: {
            ...prInfo,
            title: fullPrInfo.title,
          },
          diff_summary: {
            total_files: diffSummary.totalFiles,
            additions: diffSummary.additions,
            deletions: diffSummary.deletions,
          },
          diff_text: diffText,
          worktree,
          recommended_reviewers: recommendedReviewers,
          files: diffSummary.changedFiles,
        },
      };
    },
  });

  // Helper to register专项 tools
  function registerReviewerTool(
    name: string,
    label: string,
    description: string,
    reviewerFn: (files: ChangedFile[]) => import("./types").ReviewResult
  ): void {
    pi.registerTool({
      name,
      label,
      description,
      parameters: Type.Object({
        diff_text: Type.String(),
        files: Type.Array(
          Type.Object({
            path: Type.String(),
            status: Type.String(),
            additions: Type.Number(),
            deletions: Type.Number(),
            hunks: Type.Array(
              Type.Object({
                oldStart: Type.Number(),
                oldCount: Type.Number(),
                newStart: Type.Number(),
                newCount: Type.Number(),
                lines: Type.Array(Type.String()),
              })
            ),
          })
        ),
        worktree_path: Type.Optional(Type.String()),
      }),
      async execute(_toolCallId, params) {
        const files = params.files as ChangedFile[];
        const result = reviewerFn(files);
        return {
          content: [
            { type: "text", text: formatReviewResult(result, label) },
          ],
          details: {
            findings: result.findings,
            summary: result.summary,
            notes: result.notes,
          },
        };
      },
    });
  }

  registerReviewerTool(
    "review_tests",
    "Review Tests",
    "Analyze test coverage for the PR changes",
    reviewTests
  );
  registerReviewerTool(
    "review_error_handling",
    "Review Error Handling",
    "Hunt silent failures and bare catches",
    reviewErrors
  );
  registerReviewerTool(
    "review_type_design",
    "Review Type Design",
    "Analyze type/interface changes",
    reviewTypes
  );
  registerReviewerTool(
    "review_comments",
    "Review Comments",
    "Extract and analyze new/modified comments",
    reviewComments
  );
  registerReviewerTool(
    "review_code_quality",
    "Review Code Quality",
    "General code quality rules",
    reviewQuality
  );
  registerReviewerTool(
    "review_simplification",
    "Review Simplification",
    "Flag over-complex code",
    reviewSimplification
  );

  pi.registerTool({
    name: "save_review",
    label: "Save Review",
    description: "Persist a completed PR review report to .pr-reviews/ as markdown",
    parameters: Type.Object({
      pr_info: Type.Object({
        number: Type.Number(),
        repo: Type.String(),
        title: Type.String(),
      }),
      findings: Type.Array(
        Type.Object({
          type: Type.String(),
          file: Type.String(),
          line: Type.Optional(Type.Number()),
          severity: Type.String(),
          description: Type.String(),
        })
      ),
      summary: Type.String(),
      recommendations: Type.Array(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const date = new Date().toISOString().split("T")[0];
      const reviewDir = join(ctx.cwd, ".pr-reviews");
      mkdirSync(reviewDir, { recursive: true });

      const filename = `${date}-pr-${params.pr_info.number}-${params.pr_info.repo}-review.md`;
      const filepath = join(reviewDir, filename);

      const severityOrder = { critical: 0, warning: 1, info: 2 };
      const sortedFindings = [...params.findings].sort(
        (a, b) => severityOrder[a.severity as keyof typeof severityOrder] - severityOrder[b.severity as keyof typeof severityOrder]
      );

      const md = [
        `# PR Review: #${params.pr_info.number} - ${params.pr_info.title}`,
        "",
        `**Repo:** ${params.pr_info.repo}  `,
        `**Date:** ${date}  `,
        "",
        "## Overall Assessment",
        "",
        params.summary,
        "",
        "## Findings",
        "",
        ...sortedFindings.map((f) => {
          const icon = f.severity === "critical" ? "✗" : f.severity === "warning" ? "⚠" : "ℹ";
          const loc = f.line ? `${f.file}:${f.line}` : f.file;
          return `- ${icon} **${f.severity}** \`${loc}\` — ${f.description}`;
        }),
        "",
        "## Recommended Actions",
        "",
        ...params.recommendations.map((r, i) => `${i + 1}. ${r}`),
        "",
      ].join("\n");

      writeFileSync(filepath, md, "utf-8");

      return {
        content: [{ type: "text", text: `Review saved to ${filepath}` }],
        details: { filepath },
      };
    },
  });

  // ── Commands ──

  pi.registerCommand("review-pr", {
    description: "Review a GitHub PR: /review-pr https://github.com/owner/repo/pull/42",
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify("Usage: /review-pr <url>", "warn");
        return;
      }
      ctx.ui.notify(`Starting review for ${args}...`, "info");
      // The user can then call review_pr tool via natural language
    },
  });

  pi.registerCommand("review-pr-cleanup", {
    description: "Remove review worktrees: /review-pr-cleanup [pr_number]",
    handler: async (args, ctx) => {
      if (args) {
        const num = parseInt(args, 10);
        const path = activeWorktrees.get(num);
        if (path) {
          try {
            removeWorktree(ctx.cwd, path);
            activeWorktrees.delete(num);
            ctx.ui.notify(`Removed worktree for PR #${num}`, "info");
          } catch (err) {
            ctx.ui.notify(`Failed to remove worktree: ${(err as Error).message}`, "error");
          }
        } else {
          ctx.ui.notify(`No worktree found for PR #${num}`, "warn");
        }
      } else {
        // Clean up all
        for (const [num, path] of activeWorktrees) {
          try {
            removeWorktree(ctx.cwd, path);
          } catch {
            // Best effort
          }
        }
        activeWorktrees.clear();
        ctx.ui.notify("All review worktrees removed", "info");
      }
    },
  });

  // ── Cleanup on shutdown ──

  pi.on("session_shutdown", () => {
    if (!config.worktree.cleanupOnSessionEnd) return;
    for (const [num, path] of activeWorktrees) {
      try {
        removeWorktree(process.cwd(), path);
      } catch {
        // Best effort
      }
    }
    activeWorktrees.clear();
  });
}
```

- [ ] **Step 3: Run tests**

Run: `cd pi-extensions/my-pr-review && npx vitest run index.test.ts`
Expected: PASS

- [ ] **Step 4: Run full test suite with coverage**

Run: `cd pi-extensions/my-pr-review && npx vitest run --coverage`
Expected: All PASS, coverage ≥100% on branches/functions/lines/statements (excluding types.ts and index.ts)

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-pr-review/index.ts pi-extensions/my-pr-review/index.test.ts
git commit -m "feat(my-pr-review): register all tools and commands"
```

---

### Task 13: Deployment Integration

**Files:**
- Modify: `install.sh`

- [ ] **Step 1: Update install.sh to copy my-pr-review**

Add to `install.sh`:

```bash
# my-pr-review
if [ -d "pi-extensions/my-pr-review" ]; then
  echo "📋 Installing my-pr-review..."
  mkdir -p "$PI_AGENT_DIR/extensions/my-pr-review"
  cp -r pi-extensions/my-pr-review/* "$PI_AGENT_DIR/extensions/my-pr-review/"
  echo "✅ my-pr-review installed"
fi
```

- [ ] **Step 2: Test install**

Run: `./install.sh`
Expected: `my-pr-review` files copied to `~/.pi/agent/extensions/my-pr-review/`

- [ ] **Step 3: Commit**

```bash
git add install.sh
git commit -m "chore: add my-pr-review to install script"
```

---

## Spec Coverage Check

| Spec Requirement | Implementing Task |
|------------------|-------------------|
| 1+6 Tool Pattern (8 tools total) | Task 12 |
| `review_pr` orchestrator with worktree | Task 12 |
| `review_comments` | Task 5 |
| `review_tests` | Task 6 |
| `review_error_handling` | Task 7 |
| `review_type_design` | Task 8 |
| `review_code_quality` | Task 9 |
| `review_simplification` | Task 10 |
| `save_review` | Task 12 |
| Worktree isolation (create/reuse/cleanup) | Task 4, Task 12 |
| Diff parsing | Task 3 |
| Git operations (PR fetch, URL parse) | Task 4 |
| TUI rendering | Task 11 |
| Slash commands (`/review-pr`, `/review-pr-cleanup`) | Task 12 |
| Config loading | Task 2 |
| Review report markdown format | Task 12 |
| 100% test coverage | All tasks |

## Placeholder Scan

✅ No "TBD", "TODO", "implement later", or "fill in details" found  
✅ No vague "add appropriate error handling" — specific error cases in Task 4 and Task 12  
✅ No "Similar to Task N" — each task is self-contained  
✅ All type signatures match across tasks  

## Execution Handoff

**Plan complete and saved to `.lychee/artifacts/plans/2026-06-05-my-pr-review.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints

**Which approach?**
