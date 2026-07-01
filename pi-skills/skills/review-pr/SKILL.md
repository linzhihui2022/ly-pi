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
DIFF_DIR_REL=$(git rev-parse --git-path review-pr)
mkdir -p "$DIFF_DIR_REL"
DIFF_DIR=$(cd "$DIFF_DIR_REL" && pwd)
DIFF_FILE="$DIFF_DIR/review-pr-$(date +%s)-$$-$RANDOM.diff"
git diff -U10 "$MERGE_BASE"..HEAD > "$DIFF_FILE"
```

- 文件放在 `.git/review-pr/` 下，git 不会追踪，也不会污染工作区。
- 使用 `git rev-parse --git-path review-pr` 能正确处理普通仓库、linked worktree 和 bare repo。
- 文件名包含时间戳、进程 ID 和随机数，避免并发冲突。
- **排除自动生成类型产物**：如果项目存在自动生成的类型文件（例如 `*.gen.ts`、GraphQL/Prisma/OpenAPI 代码生成输出、`.d.ts` 生成产物），应当在生成 diff 时排除，避免 reviewer 对无意义噪音进行审查。项目可通过以下方式处理：
  - 在 `.gitattributes` 中将对应路径标记为 `linguist-generated=true`，GitHub 会自动折叠；
  - 本地 `git diff` 使用路径排除，例如 `git diff -U10 "$MERGE_BASE"..HEAD -- . ':(exclude)*.gen.ts' ':(exclude)src/generated/**'`；
  - 无法通过 `.gitattributes` 或路径排除精确过滤时，在摘要中显式列出被排除的生成文件，并确保 reviewer 只审查其源文件/模板。

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

Read the diff file and review error handling, catch blocks, fallback logic, retry logic, and any pattern that could suppress or hide failures. **Focus only on changes introduced by this PR. Do not discuss pre-existing issues or code not modified in the diff.**`,
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

After all reviewers finish, clean up the diff file:

```bash
rm -f "$DIFF_FILE"
```

### 6. Aggregate output

Each reviewer emits a prose analysis followed by a mandatory `## Tag Summary for Aggregator` section. Parse only that section for lines beginning with `[CRITICAL]`, `[IMPORTANT]`, or `[SUGGESTION]`. Produce a single, consolidated report in Chinese. Remove duplicates and merge overlapping findings. **Discard any findings about pre-existing issues or code not changed by this PR; the report must focus solely on what the PR introduces or modifies.** Do not copy raw tagged lines verbatim, and do not include the original reviewer prose or detailed reports.

```markdown
# PR 审查摘要

## 概览
- PR: <owner/repo#number>
- 标题: <PR title>
- 默认分支: <default branch>
- 合并基线: <merge-base sha>
- 变更文件数: N
- 参与审查: <reviewer 列表>

## 裁定
<必须修复 / 建议修复 / 可合并>

## 关键问题（必须修复）
合并重复项，按主题分组。每条只保留一句话描述 + 文件位置。

- **A1. <问题一句话描述>** — `<file:line>`
  - 原因：<一句话原因>
  - 建议：<一句话建议>
- **A2. <问题一句话描述>** — `<file:line>`
  - 原因：<一句话原因>
  - 建议：<一句话建议>

## 重要问题（建议修复）
同上。合并来自不同 reviewer 的同类问题；如果多个 reviewer 提到同一处，只保留一条。

- **B1. <问题一句话描述>** — `<file:line>`
  - 原因：<一句话原因>
  - 建议：<一句话建议>
- **B2. <问题一句话描述>** — `<file:line>`
  - 原因：<一句话原因>
  - 建议：<一句话建议>

## 建议（可选）
简短、可执行。

- **C1. <建议一句话描述>** — `<file:line>`
- **C2. <建议一句话描述>** — `<file:line>`

## 未完成的审查
- <reviewer>（<原因：超时 / 失败 / 异常>）

## 推荐后续操作
1. 先修复关键问题（A 开头）。
2. 处理重要问题（B 开头）。
3. 酌情采纳建议（C 开头）。
4. 修改后重新运行 `/review-pr`。`
```

### 格式规则

- **统一使用中文**。摘要部分必须全部用中文表述。
- **去重合并**。同一文件、同一模式的问题只出现一次。
- **编号前缀**。关键问题用 `A1`, `A2`, ...；重要问题用 `B1`, `B2`, ...；建议用 `C1`, `C2`, ...。方便用户直接引用，如“修复 A2”。
- **移除标签噪音**。摘要中不出现 `[CRITICAL]` / `[IMPORTANT]` / `[SUGGESTION]`。严重度通过章节标题体现。
- **一条一点**。每条问题不超过两行核心信息（问题 + 位置），需要补充时用缩进的“原因/建议”子项。
- **文件位置前置或紧随**。定位信息放在描述之后，便于快速跳转：`packages/foo.ts:42`。
- **聚焦 PR 本身**。只报告当前 PR 引入或修改的代码相关问题；不要讨论历史遗留问题、未变更文件或既有代码缺陷。
- **不输出详细审查记录**。只保留合并后的摘要，不要展开各 reviewer 的原始 prose 输出。

## Rules

- Never run the review if the workspace is dirty or the current branch is the default branch.
- Always run `pr-code-reviewer`.
- Default to parallel dispatch.
- Preserve each reviewer's original output format and scoring; only extract severity tags for aggregation.
- Do not fix issues automatically — this skill reviews only.
- **Stay scoped to the PR. Reviewers must report only issues introduced or affected by the PR's diff; historical/pre-existing issues are out of scope. The aggregator must filter out such findings and never include them in the final report.**
- **Ignore generated artifacts. Do not review files that are automatically generated (e.g., `*.gen.ts`, `*.d.ts` from codegen, GraphQL/Prisma/OpenAPI generated outputs, or paths marked `linguist-generated=true` in `.gitattributes`). Focus review on the source files/templates that produce them.**
- If a reviewer fails, continue with the others.

## Integration

- For lightweight single-task review, use `requesting-code-review`.
- For executing a multi-task plan with per-task reviews, use `subagent-driven-development`.
- For finalizing a branch after `/review-pr` is clean, use `finishing-a-development-branch`.
