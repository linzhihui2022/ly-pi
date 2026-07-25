# Issue 跟踪器：本地 Markdown

本仓库的 issue 和 spec（你可能把 spec 叫作 PRD）以 markdown 文件的形式存放在 `.scratch/` 下。

## 约定

- 每个特性一个目录：`.scratch/<feature-slug>/`
- spec 为 `.scratch/<feature-slug>/spec.md`
- 实现 issue 一个工单一个文件，位于 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号 —— 绝不使用单个合并的工单文件
- 分诊状态记录在每个 issue 文件顶部附近的 `Status:` 行（角色字符串见 `triage-labels.md`）
- 评论和对话历史追加到文件底部的 `## Comments` 标题下

## 当 skill 说"发布到 issue 跟踪器"时

在 `.scratch/<feature-slug>/` 下创建一个新文件（需要时先创建目录）。

## 当 skill 说"获取相关工单"时

读取所引用路径下的文件。用户通常会直接传入路径或 issue 编号。

## 寻路操作（Wayfinding）

由 `/wayfinder` 使用。**map** 是一个文件，每个工单一个**子**文件。

- **Map**：`.scratch/<effort>/map.md` —— 承载 Notes / Decisions-so-far / Fog 正文。
- **子工单**：`.scratch/<effort>/issues/NN-<slug>.md`，从 `01` 开始编号，问题写在正文中。`Type:` 行记录工单类型（`research`/`prototype`/`grilling`/`task`）；`Status:` 行记录 `claimed`/`resolved`。
- **阻塞关系**：顶部附近的 `Blocked by: NN, NN` 行。当行内列出的每个文件都变为 `resolved` 时，工单解除阻塞。
- **边界（Frontier）**：扫描 `.scratch/<effort>/issues/` 中未关闭、未阻塞、未认领的文件；编号最小者优先。
- **认领**：在任何工作开始前，设置 `Status: claimed` 并保存。
- **了结**：在 `## Answer` 标题下追加答案，设置 `Status: resolved`，然后把上下文指针（gist + 链接）追加到 `map.md` 的 Decisions-so-far。
