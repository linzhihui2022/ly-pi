---
name: review-pr
description: Use when preparing a pull request, reviewing a PR diff, or needing a multi-dimensional code review across comments, tests, error handling, types, and general code quality
---

# PR Review Toolkit

Run a focused, multi-dimensional PR review by dispatching specialized reviewer subagents in parallel. This skill is the pre-PR / PR-review entry point; it does not replace lightweight task reviews from `requesting-code-review` or the task-level review inside `subagent-driven-development`.

## When to Use

- User says `/review-pr` or `/review-pr [aspects]`.
- User says they are ready to create a PR or asks for a PR review.
- You have completed a feature and want a comprehensive pre-merge review.

## Supported Aspects

| Aspect | Reviewer selected |
|--------|-------------------|
| `all` (default) | All applicable default reviewers |
| `comments` | `pr-comment-analyzer` |
| `tests` | `pr-test-analyzer` |
| `errors` | `pr-silent-failure-hunter` |
| `types` | `pr-type-design-analyzer` |
| `code` | `pr-code-reviewer` |

Multiple aspects can be combined, e.g. `/review-pr tests errors`.

## Workflow

### 1. Pre-flight checks

Abort before reviewing if any of these are true:

- `git status --short` shows staged or unstaged changes → tell the user to commit or stash first.
- Current branch is the default branch (e.g. `main` or `master`) → tell the user to create a feature branch first.
- `git merge-base HEAD origin/main` fails → no PR range can be computed.

### 2. Compute review range

```bash
DEFAULT_BRANCH=$(git rev-parse --abbrev-ref origin/HEAD | sed 's@origin/@@')
MERGE_BASE=$(git merge-base HEAD origin/$DEFAULT_BRANCH)
mkdir -p .lychee/review-pr
DIFF_FILE=".lychee/review-pr/review-$(date +%s).diff"
git diff -U10 "$MERGE_BASE"..HEAD > "$DIFF_FILE"
```

### 3. Determine applicable reviewers

| Rule | Reviewer | Condition |
|------|----------|-----------|
| Always | `pr-code-reviewer` | Always run |
| Tests | `pr-test-analyzer` | Any changed file under `test/`, `tests/`, `__tests__/`, or matching `*.test.*` / `*.spec.*`, or any production source file changed |
| Errors | `pr-silent-failure-hunter` | Diff contains `try`, `catch`, `except`, `throw`, `Error`, `finally`, `?.`, or `??` |
| Comments | `pr-comment-analyzer` | Diff adds/modifies more than 5 comment lines (`+//`, `+/*`, `+#`, `+"""`, `+'''`, or JSDoc patterns) |
| Types | `pr-type-design-analyzer` | Any changed file declares `type`, `interface`, `struct`, `class`, `enum`, or `trait` |

### 4. Dispatch reviewers in parallel

For each selected reviewer, launch a background subagent. Pass the diff file path, the list of changed files, and the merge-base SHA. Each reviewer prompt is self-contained.

```typescript
subagent({
  subagent_type: "pr-silent-failure-hunter",
  description: "Review error handling",
  prompt: `You are reviewing a git diff. Do not modify files.

## Files changed
${CHANGED_FILES}

## Diff file
${DIFF_FILE}

Read the diff file and review error handling, catch blocks, fallback logic, retry logic, and any pattern that could suppress or hide failures.`,
  run_in_background: true
})
```

Repeat for each applicable reviewer. All background agents can be launched in the same message.

### 5. Collect results

Wait for each agent to finish:

```typescript
get_subagent_result({ agent_id: "<agent-id-1>", wait: true })
get_subagent_result({ agent_id: "<agent-id-2>", wait: true })
```

If an agent fails or times out, record it under `Reviewers not completed` and continue.

### 6. Aggregate output

Each reviewer emits a prose analysis followed by a mandatory `## Tag Summary for Aggregator` section. Parse only that section for lines beginning with `[CRITICAL]`, `[IMPORTANT]`, or `[SUGGESTION]`. Copy tagged lines into the corresponding summary bucket, prefixed by the reviewer name. Place the full reviewer outputs in `Detailed reviewer reports`.

```markdown
# PR Review Summary

## Scope
- Default branch: origin/main
- Merge base: <sha>
- Files changed: N
- Reviewers run: pr-code-reviewer, pr-test-analyzer, ...

## Critical Issues (must fix)
- [pr-silent-failure-hunter] Silent retry in catch block masks gateway failures [src/payment.ts:15]
- [pr-test-analyzer] Missing negative test for invalid amount [src/payment.test.ts:7]

## Important Issues (should fix)
- ...

## Suggestions (nice to have)
- ...

## Detailed reviewer reports
[Full text from each reviewer for reference]

## Reviewers not completed
- pr-type-design-analyzer (timed out)

## Verdict
Ready to merge | Needs fixes | Do not merge

## Recommended Action
1. Fix critical issues first.
2. Address important issues.
3. Consider suggestions.
4. Re-run `/review-pr` after fixes.
```

## Rules

- Never run the review if the workspace is dirty or the current branch is the default branch.
- Always run `pr-code-reviewer`.
- Default to parallel dispatch.
- Preserve each reviewer's original output format and scoring; only extract severity tags for aggregation.
- Do not fix issues automatically — this skill reviews only.
- If a reviewer fails, continue with the others.

## Integration

- For lightweight single-task review, use `requesting-code-review`.
- For executing a multi-task plan with per-task reviews, use `subagent-driven-development`.
- For finalizing a branch after `/review-pr` is clean, use `finishing-a-development-branch`.
