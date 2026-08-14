---
name: review-pr
description: 在准备 PR、审查 PR diff，或需要从注释、测试、错误处理、类型和整体代码质量等多个维度进行代码审查时使用
---

# PR review 工作流

通过并行调度专职 reviewer subagent，执行聚焦的多维 PR review。

## 何时使用

- 用户输入 `/review-pr` 或不带 URL 的 `/review-pr [aspects]`。
- 用户提供 `/review-pr <https://github.com/owner/repo/pull/N>` 或 `/review-pr [aspects] <PR URL>`。
- 用户表示准备创建 PR，或请求进行 PR review。
- 你已完成功能开发，并希望在合并前进行全面 review。

未提供 PR URL 时，尝试检测与当前分支关联的 PR。如果检测到 PR，在报告标题中使用其元数据，并将本地 diff 作为该 PR 进行审查。如果未检测到 PR，继续审查本地分支 diff，并在报告标题中注明。

## 支持的审查维度

| 维度 | 选用的 reviewer |
|--------|-------------------|
| `all`（默认） | 所有适用的默认 reviewer |
| `comments` | `pr-comment-analyzer` |
| `tests` | `pr-test-analyzer` |
| `errors` | `pr-silent-failure-hunter` |
| `types` | `pr-type-design-analyzer` |
| `code` | `pr-code-reviewer` |

可组合多个维度，例如 `/review-pr tests errors`。

## 工作流

### 1. 前置检查

出现以下任一情况时，在 review 前中止：

- `git status --short` 显示 staged 或 unstaged 变更 → 告知用户先提交或 `stash`。
- 当前分支是默认分支（例如 `main` 或 `master`）→ 告知用户先创建功能分支。
- `git merge-base HEAD origin/main` 失败 → 无法计算 PR 范围。

### 2. 确定 PR 元数据

确定要在报告标题中显示的 PR 元数据（编号、URL、标题）：

1. **如果用户在调用中提供了 PR URL**（例如 `/review-pr https://github.com/owner/repo/pull/42`）：
   - 从 URL 中解析 `owner`、`repo` 和 `number`。
   - 将提供的 URL 设为 `PR_URL`。
   - 可选择使用 `gh pr view <number> --json title` 或 `GET /repos/{owner}/{repo}/pulls/{number}` 获取 PR 标题。
2. **如果未提供 URL**，尝试检测当前分支的 PR：
   - 尝试运行 `gh pr view --json number,url,title --state all`。
     - 如果命令成功并返回 PR，将输出中的值分别设为 `PR_URL`、`PR_NUMBER` 和 `PR_TITLE`。
   - 如果 `gh` 不可用或未返回 PR，并且已设置 `GITHUB_TOKEN`：
     - 确定当前分支：`git branch --show-current`。
     - 确定 GitHub 远程仓库：通过 `git config` / `git remote` 使用分支的跟踪远程仓库或 `origin`。
     - 从远程 URL 中解析 `owner/repo`（HTTPS：`https://github.com/owner/repo.git`，SSH：`git@github.com:owner/repo.git`）。
     - 查询 `GET /repos/{owner}/{repo}/pulls?head={owner}:{branch}&state=all`。
     - 如果响应至少包含一个 PR，使用第一个结果的 `html_url`、`number` 和 `title`。
3. **如果两种尝试后仍未找到 PR**：
   - 将 `PR_URL` 设为 `未检测到`，将 `PR_TITLE` 设为空。
   - 继续审查本地分支 diff。

### 3. 计算审查范围

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
  - 无法通过 `.gitattributes` 或路径排除精确过滤时，在摘要中明确列出被排除的生成文件，并确保 reviewer 只审查其源文件/模板。

### 4. 确定适用的 reviewer

| 规则 | reviewer | 条件 |
|------|----------|------|
| 始终 | `pr-code-reviewer` | 始终运行 |
| 测试 | `pr-test-analyzer` | `test/`、`tests/`、`__tests__/` 下的任何文件发生变更，存在匹配 `*.test.*` / `*.spec.*` 的变更文件，或任何生产源文件发生变更 |
| 错误 | `pr-silent-failure-hunter` | diff 包含 `try`、`catch`、`except`、`throw`、`Error`、`finally`、`?.` 或 `??` |
| 注释 | `pr-comment-analyzer` | diff 新增/修改超过 5 行注释（`+//`、`+/*`、`+#`、`+"""`、`+'''` 或 JSDoc 模式） |
| 类型 | `pr-type-design-analyzer` | 任何变更文件声明 `type`、`interface`、`struct`、`class`、`enum` 或 `trait` |

### 5. 并行调度 reviewer

对于每个选中的 reviewer，启动一个后台 subagent，并提供 diff 文件路径、变更文件列表和 merge-base SHA。每个 reviewer 提示词都必须自包含。

使用带有 `tasks` 数组的 `subagent` 并行启动所有选中的 reviewer：

```typescript
subagent({
  tasks: [
    {
      agent: "pr-code-reviewer",
      task: `你正在审查一个 \`git diff\`。不要修改文件。

## 变更文件
${CHANGED_FILES}

## diff 文件
${DIFF_FILE}

读取 diff 文件，审查整体代码质量、正确性和项目规范合规性。**只报告本 PR 引入或修改的代码（diff 中以 `+` 开头的行）产生的问题；上下文行和删除行是既存代码，仅供理解，不得作为发现对象。历史遗留问题不在范围内；唯一例外是本 PR 的变更直接破坏了既存代码的行为，此类问题必须说明由哪处变更引发。**

**重要：** 不要执行 CI/build/test 命令（例如 \`npm test\`、\`pnpm typecheck\`、\`lint\`、\`build\`、\`prettier --check\`）。必要时只能使用轻量级 \`read\`/\`grep\`/\`find\` 操作检查项目规范或相关文件。`
    },
    {
      agent: "pr-test-analyzer",
      task: `审查 \`git diff\` 的测试覆盖质量和完整性。

## 变更文件
${CHANGED_FILES}

## diff 文件
${DIFF_FILE}

**只报告本 PR 引入或修改的代码（diff 中以 `+` 开头的行）产生的问题；上下文行和删除行是既存代码，仅供理解，不得作为发现对象。历史遗留问题不在范围内；唯一例外是本 PR 的变更直接破坏了既存代码的行为，此类问题必须说明由哪处变更引发。** 评估关键功能是否有充分测试、现有测试是否已更新，以及边界情况是否已覆盖。不要修改文件。`
    },
    {
      agent: "pr-silent-failure-hunter",
      task: `审查 \`git diff\` 中的静默失败和不充分的错误处理。

## 变更文件
${CHANGED_FILES}

## diff 文件
${DIFF_FILE}

**只报告本 PR 引入或修改的代码（diff 中以 `+` 开头的行）产生的问题；上下文行和删除行是既存代码，仅供理解，不得作为发现对象。历史遗留问题不在范围内；唯一例外是本 PR 的变更直接破坏了既存代码的行为，此类问题必须说明由哪处变更引发。** 查找被吞掉的异常、缺失的错误分支、不恰当的 fallback 和未处理的边界情况。不要修改文件。`
    },
    {
      agent: "pr-comment-analyzer",
      task: `审查 \`git diff\` 中注释和文档的准确性。

## 变更文件
${CHANGED_FILES}

## diff 文件
${DIFF_FILE}

**只报告本 PR 引入或修改的注释和文档（diff 中以 `+` 开头的行）产生的问题；上下文行和删除行是既存代码，仅供理解，不得作为发现对象。历史遗留问题不在范围内；唯一例外是本 PR 的变更使既存注释失真，此类问题必须说明由哪处变更引发。** 检查注释、docstring 和文档是否准确、完整且可维护。不要修改文件。`
    },
    {
      agent: "pr-type-design-analyzer",
      task: `审查 \`git diff\` 中的类型设计、封装和 invariant 表达。

## 变更文件
${CHANGED_FILES}

## diff 文件
${DIFF_FILE}

**只报告本 PR 引入或修改的类型及其实例化代码（diff 中以 `+` 开头的行）产生的问题；上下文行和删除行是既存代码，仅供理解，不得作为发现对象。历史遗留问题不在范围内；唯一例外是本 PR 的变更破坏了既存类型的 invariant 或既有使用点，此类问题必须说明由哪处变更引发。** 评估类型定义、接口、类和结构选择的清晰性、安全性和封装。不要修改文件。`
    }
  ],
  async: true
})
```

只包含第 4 步中选中的 reviewer 任务。省略不满足条件的 reviewer。

### 6. 收集结果

等待所有 reviewer 完成：

```typescript
subagent_wait({ all: true })
```

如果 agent 失败或超时，将其记录在 `未完成的审查` 下，然后继续。

所有 reviewer 完成后，清理 diff 文件：

```bash
rm -f "$DIFF_FILE"
```

### 7. 聚合输出

每个 reviewer 都会先输出散文分析，再输出强制性的 `## 聚合器标签摘要` 部分。只解析该部分中以 `[严重]`、`[重要]` 或 `[建议]` 开头的行。生成一份统一的中文报告，删除重复项并合并重叠发现。**丢弃所有关于既存问题或 PR 未变更代码的发现；报告必须专注于此 PR 引入或修改的内容。** 核对方法：对照 diff 文件检查每条发现的 `file:line`——必须落在 `+` 行（新增/修改行）上；指向上下文行或删除行的发现一律丢弃，除非 reviewer 明确说明了它由本 PR 的哪处变更直接引发（例如签名变更波及既有调用点）。丢弃时不要静音处理：在报告的 `## 已过滤的越界发现` 一节中记为「<reviewer>：N 条发现因超出 PR 范围被丢弃」；若没有被丢弃的发现则省略此节。 不要逐字复制原始标签行，也不要包含 reviewer 的原始散文或详细报告。

```markdown
# PR 审查摘要

## 概览
- PR: ${PR_URL:-未检测到}
- 标题: ${PR_TITLE:-}
- 默认分支: <默认分支>
- 合并基线: <merge-base SHA>
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

## 已过滤的越界发现
- <reviewer>：N 条发现因超出 PR 范围被丢弃

## 未完成的审查
- <reviewer>（<原因：超时 / 失败 / 异常>）

## 推荐后续操作
1. 先修复关键问题（A 开头）。
2. 处理重要问题（B 开头）。
3. 酌情采纳建议（C 开头）。
4. 修改后重新运行 `/review-pr`。
```

### 格式规则

- **统一使用中文**。摘要部分必须全部用中文表述。
- **去重合并**。同一文件、同一模式的问题只出现一次。
- **编号前缀**。关键问题用 `A1`, `A2`, ...；重要问题用 `B1`, `B2`, ...；建议用 `C1`, `C2`, ...。方便用户直接引用，如“修复 A2”。
- **移除标签噪音**。摘要中不出现 `[严重]` / `[重要]` / `[建议]`。严重度通过章节标题体现。
- **一条一点**。每条问题不超过两行核心信息（问题 + 位置），需要补充时用缩进的“原因/建议”子项。
- **文件位置前置或紧随**。定位信息放在描述之后，便于快速跳转：`packages/foo.ts:42`。
- **聚焦 PR 本身**。只报告当前 PR 引入或修改的代码相关问题；不要讨论历史遗留问题、未变更文件或既有代码缺陷。
- **不输出详细审查记录**。只保留合并后的摘要，不要展开各 reviewer 的原始散文输出。

## 规则

- 如果工作区有未提交变更，或当前分支是默认分支，绝不运行 review。
- 始终运行 `pr-code-reviewer`。
- 未提供 PR URL 时，先尝试通过 `gh` CLI 检测当前分支的 PR，然后在设置了 `GITHUB_TOKEN` 时以 GitHub API 作为 fallback。无论是否检测到 PR，都继续审查本地 diff。
- 默认并行调度。
- 保留每个 reviewer 原始的输出格式和评分；聚合时只提取严重度标签。
- 不要自动修复问题——此 skill 只负责审查。
- **专注于 PR 范围。reviewer 必须只报告 PR diff 引入或影响的问题；历史问题和既存问题不在范围内。聚合器必须过滤此类发现，绝不能将其纳入最终报告。**
- **忽略生成产物。不要审查自动生成的文件（例如 `*.gen.ts`、代码生成产生的 `*.d.ts`、GraphQL/Prisma/OpenAPI 生成输出，或 `.gitattributes` 中标记为 `linguist-generated=true` 的路径）。专注于生成这些文件的源文件/模板。**
- 如果某个 reviewer 失败，继续使用其他 reviewer。

## 集成

- 对于轻量级单任务 review，调度 `reviewer` subagent 并提供目标 diff 和要求，而不是运行完整工作流。
- 此 skill 只报告发现；代码修改和分支收尾仍由调用方负责。
- `/review-pr` 结果干净后，如果用户要求创建 PR，使用 `creating-pull-requests`。
