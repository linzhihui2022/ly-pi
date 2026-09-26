# Issue 跟踪器：GitHub

本仓库的 issue 和 spec（你可能把 spec 叫作 PRD）以 GitHub issue 的形式存放在 `linzhihui2022/ly-pi`。所有操作使用 `gh` CLI。

## 约定

- **创建 issue**：`gh issue create --title "..." --body "..."`。多行正文使用 heredoc。
- **读取 issue**：`gh issue view <number> --comments`，用 `jq` 过滤评论，同时获取标签。
- **列出 issue**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，配合相应的 `--label` 与 `--state` 过滤。
- **评论 issue**：`gh issue comment <number> --body "..."`
- **添加 / 移除标签**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **关闭**：`gh issue close <number> --comment "..."`

仓库由 `git remote -v` 推断；在克隆目录内运行时 `gh` 会自动完成。

分诊标签字符串记录在 `triage-labels.md`。由 `/to-spec` 与 `/to-tickets` 发布的 spec 与工单带有 `ready-for-agent`。

## 把 PR 作为分诊入口

**PRs as a request surface: no。**（若本仓库把外部 PR 视为功能请求则设为 `yes`；`/triage` 会读取该标记。）

设为 `yes` 时，PR 与 issue 走同一套标签与状态，使用对应的 `gh pr` 命令：

- **读取 PR**：`gh pr view <number> --comments`，用 `gh pr diff <number>` 取 diff。
- **列出待分诊的外部 PR**：`gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`，只保留 `authorAssociation` 为 `CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR`、`NONE` 的条目（丢弃 `OWNER`/`MEMBER`/`COLLABORATOR`）。
- **评论 / 打标签 / 关闭**：`gh pr comment`、`gh pr edit --add-label`/`--remove-label`、`gh pr close`。

GitHub 的 issue 与 PR 共用一套编号，因此单独的 `#42` 可能是两者之一：先用 `gh pr view 42` 解析，失败再回退到 `gh issue view 42`。

## 当 skill 说"发布到 issue 跟踪器"时

创建一个 GitHub issue。

## 当 skill 说"获取相关工单"时

运行 `gh issue view <number> --comments`。

## 寻路操作（Wayfinding）

由 `/wayfinder` 使用。**map** 是一个 issue，**子** issue 作为工单。

- **Map**：单个带 `wayfinder:map` 标签的 issue，承载 Notes / Decisions-so-far / Fog 正文。`gh issue create --label wayfinder:map`。
- **子工单**：以 GitHub sub-issue 形式关联到 map 的 issue（对 sub-issues 端点调用 `gh api`）。sub-issues 不可用时，把子工单加入 map 正文的 task list，并在子工单正文顶部写 `Part of #<map>`。标签：`wayfinder:<type>`（`research`/`prototype`/`grilling`/`task`）。认领后，工单指派给推进它的开发者。
- **阻塞关系**：GitHub 的**原生 issue 依赖**，这是规范且在 UI 中可见的表达方式。用 `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>` 添加边，其中 `<blocker-db-id>` 是阻塞方的数字**数据库 id**（`gh api repos/<owner>/<repo>/issues/<n> --jq .id`，_不是_ `#number` 或 `node_id`）。GitHub 通过 `issue_dependencies_summary.blocked_by` 报告（仅未关闭的阻塞方，是实时闸门）。依赖功能不可用时，回退为子工单正文顶部的 `Blocked by: #<n>, #<n>` 行。当全部阻塞方关闭时，工单解除阻塞。
- **边界查询（Frontier query）**：列出 map 未关闭的子 issue（`gh issue list --state open`，限定在 map 的 sub-issues / task list 内），剔除仍有未关闭阻塞方（`issue_dependencies_summary.blocked_by > 0`，或 `Blocked by` 行中存在未关闭 issue）或已有指派者的条目；map 顺序最靠前者优先。
- **认领**：`gh issue edit <n> --add-assignee @me`，这是该会话的第一次写入。
- **了结**：`gh issue comment <n> --body "<answer>"`，然后 `gh issue close <n>`，再把上下文指针（gist + 链接）追加到 map 的 Decisions-so-far。

## 已退役的本地跟踪器

`.scratch/` 不再是 issue 跟踪器。它承载过的每个 spec 与工单都已迁移为 GitHub issue；归档的决策记录带有 `historical` 标签并已关闭。该目录保留为 agent 的临时工作区——只放临时文件，不再放 issue、spec 或状态跟踪。
