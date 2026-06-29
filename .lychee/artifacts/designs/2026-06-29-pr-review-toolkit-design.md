# PR Review Toolkit for Pi — Design Spec

## Goal
Port the intent of Claude Code's `pr-review-toolkit:review-pr` plugin to Pi by:
1. Adding five specialized review subagents under `pi-agents/`.
2. Adding an orchestrator skill `review-pr` that decides which reviewers apply to the current diff and dispatches them in parallel.

The result is a focused, opt-in PR review workflow that does not replace existing review infrastructure (`requesting-code-review`, `subagent-driven-development`) but supplements it for pre-PR / PR-review moments.

## Scope

### In scope
- Five new subagents: `pr-code-reviewer`, `pr-silent-failure-hunter`, `pr-test-analyzer`, `pr-comment-analyzer`, `pr-type-design-analyzer`.
- One new skill: `pi-skills/review-pr/SKILL.md`.
- A deterministic, file-and-pattern-based selector that chooses which reviewers to run.
- Parallel dispatch of selected reviewers by default.
- Aggregated output in the existing Pi reviewer format.

### Out of scope
- Automatic fixes or fix subagent loops (review only).
- GitHub API integration or inline PR comment posting.
- Replacing the generic `reviewer` subagent or the `requesting-code-review` skill.
- A separate dispatcher subagent (the orchestrator skill performs selection directly with deterministic rules).

## Subagents

All subagents are read-only reviewers. They receive a scoped prompt and a git diff.

| Subagent | Focus | Model | Default trigger |
|----------|-------|-------|-----------------|
| `pr-code-reviewer` | General correctness, project guideline compliance, bugs | `kimi-for-coding` | Always |
| `pr-silent-failure-hunter` | Silent failures, error handling, catch blocks | `kimi-for-coding` | Error-handling patterns in diff |
| `pr-test-analyzer` | Test coverage quality and behavioral gaps | `kimi-for-coding` | Test or production code changed |
| `pr-comment-analyzer` | Comment/docstring accuracy and maintainability | `deepseek-v4-flash` | Significant comment additions |
| `pr-type-design-analyzer` | Type design, invariants, encapsulation | `kimi-k2-thinking` | New or modified type definitions |
### Prompt adaptations from Claude Code
- Remove Claude Code plugin metadata (`color`, CLI invocation examples).
- Replace references to `CLAUDE.md` with "project guidance file (`AGENTS.md` / `.rpiv/guidance/`)".
- Replace `Task` tool examples with Pi `subagent` tool examples.
- Preserve each agent's core rubric, scoring dimensions, and output structure.
- Each prompt begins with: "You are reviewing a git diff. Do not modify files."
- Every finding must start with a severity tag: `[CRITICAL]`, `[IMPORTANT]`, or `[SUGGESTION]`. The tag is followed by the reviewer-specific format and score/rationale.

## Orchestrator Skill: `review-pr`

### Trigger conditions
- User types `/review-pr` or `/review-pr [aspects]`.
- User says they are ready to create a PR or asks for a PR review.

### Arguments
| Aspect | Reviewer selected |
|--------|-------------------|
| `all` (default) | All applicable default reviewers |
| `comments` | `pr-comment-analyzer` |
| `tests` | `pr-test-analyzer` |
| `errors` | `pr-silent-failure-hunter` |
| `types` | `pr-type-design-analyzer` |
| `code` | `pr-code-reviewer` |

Multiple aspects can be supplied, e.g. `/review-pr tests errors`.

### Selection rules when `all`
1. Always include `pr-code-reviewer`.
2. Include `pr-test-analyzer` if any changed file is under `test/`, `tests/`, `__tests__/`, or matches `*.test.*`, `*.spec.*`, or if any production source file changed.
3. Include `pr-silent-failure-hunter` if the diff contains `try`, `catch`, `except`, `?.`, `throw`, `Error`, or `finally`.
4. Include `pr-comment-analyzer` if the diff adds or modifies more than 5 comment/docstring lines (detected by `+//`, `+/*`, `+#`, `+"""`, `+'''`, or JSDoc patterns).
5. Include `pr-type-design-analyzer` if any changed file declares `type`, `interface`, `struct`, `class`, `enum`, or `trait`.
6. `pr-code-simplifier` is intentionally excluded from this Pi port — simplification suggestions tend to produce noise and conflict with existing style. If code simplification is needed, it can be handled as a separate future skill or command.

### Workflow
1. Pre-flight checks:
   - `git status --short` — if any staged or unstaged changes exist, abort and tell the user to commit/stash first.
   - Determine default branch (e.g. `origin/main` or `origin/master`). If current branch is the default branch, abort and tell the user to create a feature branch first.
   - Compute merge-base: `MERGE_BASE=$(git merge-base HEAD origin/main)`. If this fails, abort.
2. Generate diff file: `bash` runs `git diff -U10 "$MERGE_BASE"..HEAD > .lychee/review-pr/review-<timestamp>.diff`.
3. Collect changed files: `git diff --name-only "$MERGE_BASE"..HEAD`.
4. Apply selection rules to determine reviewers.
5. Announce the selected reviewers to the user.
6. Dispatch each selected reviewer in parallel via `subagent({ run_in_background: true })`.
7. Wait for all results with `get_subagent_result({ wait: true })`.
   - If a reviewer fails or times out, record it in the "Reviewers not completed" section and continue.
8. Aggregate into a single report.

### Aggregation rules
1. Read all reviewer outputs.
2. For each line beginning with `[CRITICAL]`, `[IMPORTANT]`, or `[SUGGESTION]`, copy it into the corresponding summary bucket, prefixed by the reviewer name.
3. Any output not tagged is placed in an appendix bucket `Detailed reviewer reports` so its original context is preserved.
4. If a reviewer fails, record its name in `Reviewers not completed`.

## Aggregated output format
```markdown
# PR Review Summary

## Scope
- Files changed: N
- Reviewers run: reviewer-a, reviewer-b, ...

## Critical Issues (must fix)
- [reviewer] description [file:line]

## Important Issues (should fix)
- [reviewer] description [file:line]

## Suggestions (nice to have)
- [reviewer] description [file:line]

## Positive Observations
- ...

## Verdict
Ready to merge | Needs fixes | Do not merge

## Recommended Action
1. Fix critical issues first.
2. Address important issues.
3. Consider suggestions.
4. Re-run `/review-pr` after fixes.
```

## File structure
```
pi-agents/
  pr-code-reviewer.md
  pr-silent-failure-hunter.md
  pr-test-analyzer.md
  pr-comment-analyzer.md
  pr-type-design-analyzer.md
pi-skills/
  review-pr/
    SKILL.md
```

## Integration with existing skills
- `requesting-code-review` remains the lightweight single-task review entry point, and will gain a short cross-reference to `review-pr` for pre-PR scenarios.
- `subagent-driven-development` keeps its own task-level reviewer.
- `review-pr` is the dedicated pre-PR / PR review orchestrator.

## Testing plan
1. Baseline pressure scenario: ask an unskilled agent to review a PR-like diff and observe that it misses specialized dimensions (no test coverage analysis, no error handling audit).
2. Write subagents and skill.
3. Re-run the same diff through `/review-pr` and verify the orchestrator selects the correct reviewers and the aggregated report covers all expected dimensions.
4. Test each aspect argument individually (`/review-pr tests`, `/review-pr errors`, etc.).
5. Test with no changed files and with trivial changes to ensure graceful handling.

## Risks and mitigations
| Risk | Mitigation |
|------|------------|
| Reviewers produce inconsistent output formats | Each subagent prompt includes an explicit output template; a mandatory `[CRITICAL]`/`[IMPORTANT]`/`[SUGGESTION]` tag prefixes every finding so the aggregator can group them. |
| Parallel dispatch creates too much cost | Default `all` only runs applicable reviewers; user can narrow with aspects. |
| Selection rules miss a relevant reviewer | Rules are conservative: `pr-code-reviewer` always runs, and `pr-test-analyzer` runs on any source change. |
| Overlap with existing `reviewer` subagent | Position `review-pr` as a pre-PR orchestrator, not a replacement. |
| Type-design analyzer fires too often | Trigger only on new/modified type declarations, not every source file. |
| Workspace not clean | Abort before any review; user must commit or stash. |
| Current branch is default branch | Abort; no PR range can be computed. |
| A reviewer fails during parallel run | Record the failure and continue; include it in final output. |
| Multi-language projects | Selection rules use generic patterns (`try/catch`, `class`, `type`, etc.) and file paths, not language-specific heuristics only. |

## Success criteria
- `/review-pr` successfully identifies changed files, selects reviewers, dispatches them in parallel, and aggregates results.
- Each new subagent can be invoked independently with a diff and produces coherent findings.
- The skill is discoverable and does not interfere with existing review skills.
