# my-pr-review Design

## Overview

A Pi Extension that replicates the `pr-review-toolkit:review-pr` experience from Claude Code. When a user wants to review a GitHub PR, the extension provides 7 specialized tools that extract structured review materials from the diff. The main agent orchestrates which tools to call, synthesizes findings, and outputs a persistent markdown report.

**Core principle:** Extension provides data extraction capabilities; LLM orchestrates routing and judgment.

## Problem

- The existing `requesting-code-review` skill is a manual guide — it tells the AI "you can use subagent for review" but does not enforce or automate the workflow
- When a user posts a PR link, the AI reads the skill then does a hand-wavy manual review, skipping the subagent dispatch entirely
- There is no structured, multi-dimensional PR review capability in Pi comparable to Claude Code's `pr-review-toolkit`

## Constraints

- Pi Extension has **no `registerAgent` API** — cannot register specialized review agents like Claude Code plugins
- Pi Extension **cannot call LLM APIs directly** — no exposed LLM interface for tool-internal reasoning
- Extension must use `registerTool` to provide data extraction, and rely on the main agent for routing and synthesis

## Architecture

### 1+6 Tool Pattern

| Tool | Role | Input | Output |
|------|------|-------|--------|
| `review_pr` | **Orchestrator** — fetches diff, creates worktree, recommends reviewers | `pr_url` | diff text, file list, stats, `recommended_reviewers`, `worktree` info |
| `review_comments` | Extract and analyze new/modified comments | `diff_text`, `files` | Comment findings with accuracy checks |
| `review_tests` | Analyze test coverage completeness | `diff_text`, `files`, `worktree_path?` | Test files, uncovered changes, missing tests, optionally test run results |
| `review_error_handling` | Hunt silent failures and bare catches | `diff_text`, `files` | try/catch/Promise/throw findings |
| `review_type_design` | Analyze type/interface changes | `diff_text`, `files` | New/modified types, invariant checks |
| `review_code_quality` | General code quality rules | `diff_text`, `files` | Complexity, duplication, style issues |
| `review_simplification` | Flag over-complex code | `diff_text`, `files` | High-complexity snippets, extractable functions |
| `save_review` | Persist synthesized report to markdown | `pr_info`, `findings`, `summary`, `recommendations` | File path of saved report |

### Worktree Isolation

When the current working directory belongs to the PR's repository:

1. `review_pr` creates a git worktree: `git worktree add ../{repo}-pr-{number}-review origin/{headRef}`
2. Creates a review branch: `git checkout -b review/pr-{number} origin/{headRef}`
3. All subsequent tools operate within the worktree path
4. Benefits: can run tests, read full file content, verify compilation

When the cwd does **not** match the PR repo → falls back to pure diff mode (no worktree).

### Lifecycle

```
review_pr (creates worktree) 
  → LLM routes to专项 tools (parallel)
  → LLM synthesizes findings
  → save_review (writes .pr-reviews/YYYY-MM-DD-pr-{number}-{repo}-review.md)
  → session_shutdown or /review-pr-cleanup (removes worktree)
```

## Data Flow

```
User: "review this PR: https://github.com/owner/repo/pull/42"
  ↓
[review_pr]
  1. Parse PR URL → owner, repo, number
  2. Check if cwd matches repo
  3. If match: create worktree + review branch
  4. Fetch diff (git diff base...head or gh pr diff)
  5. Parse diff → files[], hunks, stats
  6. Generate recommended_reviewers based on file types
  Output: { pr_info, diff_summary, diff_text, worktree, recommended_reviewers, files }
  ↓
[LLM analyzes, dispatches parallel tools]
  e.g. review_tests + review_error_handling + review_code_quality
  Each receives: { diff_text, files, worktree_path? }
  ↓
[Each专项 tool]
  - Parses relevant code from diff
  - Applies lightweight rules (regex, stats, AST-lite)
  - Returns structured findings with severity + file/line refs
  ↓
[LLM synthesizes all outputs]
  - Overall assessment (Ready / Needs fixes / Needs discussion)
  - Categorized findings
  - Actionable recommendations
  ↓
[save_review]
  - Writes .pr-reviews/YYYY-MM-DD-pr-{number}-{repo}-review.md
  - Returns file path
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `gh` CLI not installed | `review_pr` returns error: "gh CLI is required. Install: https://cli.github.com/" |
| PR not found / no permission | Return error with gh stderr |
| Dirty working tree | Warn user before creating worktree |
| Diff > 500KB | Truncate with notice; preserve file list + per-file summary |
| No recognizable test framework | `review_tests` returns empty findings + note |
| Worktree already exists | Reuse existing, pull latest changes |
| Worktree cleanup fails on shutdown | Log warning; list stale worktrees on next review_pr call |

## Directory Structure

```
pi-extensions/my-pr-review/
├── index.ts              # Register 8 tools + 2 commands
├── types.ts              # Shared schemas: ChangedFile, ReviewFinding, WorktreeInfo
├── config.ts             # Load my-pr-review.json
├── git.ts                # PR URL parse, worktree CRUD, diff fetch
├── parser.ts             # Diff parse: files, hunks, stats
├── reviewers/
│   ├── comments.ts       # Comment extraction + accuracy heuristics
│   ├── tests.ts          # Test file detection, coverage mapping, optional test run
│   ├── errors.ts         # Error handling pattern extraction
│   ├── types.ts          # Type/interface change extraction
│   ├── quality.ts        # Complexity, duplication, style rules
│   └── simplification.ts # Complexity metrics + extraction candidates
├── render.ts             # TUI renderCall / renderResult for all tools
├── index.test.ts         # Integration tests
├── git.test.ts
├── parser.test.ts
├── reviewers/*.test.ts
├── render.test.ts
├── vitest.config.ts
└── my-pr-review.json     # Default config (copied alongside)
```

## Configuration

```json
// my-pr-review.json
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

## Commands

- `/review-pr <url>` — Trigger review_pr flow directly
- `/review-pr-cleanup [number]` — Remove review worktree(s)

## Review Report Format (Markdown)

Saved to `{cwd}/.pr-reviews/YYYY-MM-DD-pr-{number}-{repo}-review.md`:

```markdown
# PR Review: #42 - feature/login-auth

**Repo:** owner/repo  
**Date:** 2026-06-05  
**Branch:** review/pr-42

## Overall Assessment

{Ready to merge / Needs fixes / Needs discussion}

## Findings by Dimension

### 🧪 Tests (review_tests)
- ⚠ **warning** `src/auth.ts:45` — New login() function has no corresponding test
- ✓ 2/3 changed files have test coverage

### ⚠️ Error Handling (review_error_handling)
- ✗ **critical** `src/api.ts:78` — Empty catch block swallows error silently

### ... (other dimensions)

## Recommended Actions

1. [critical] Fix empty catch at src/api.ts:78
2. [warning] Add tests for src/auth.ts:45 login()
3. [info] Consider extracting duplicate logic in src/utils.ts:120

## Raw Data

<details>
<summary>Full reviewer outputs</summary>
...
</details>
```

## Testing

- **Branches/functions/lines/statements: 100%** (project requirement)
- Exclusions: `types.ts`, `index.ts` (integration tests), real git operations (execSync wrapper)
- TDD flow: test first → fail → implement → pass → coverage
- Integration: mock `gh` CLI output, test full review_pr flow including worktree CRUD
