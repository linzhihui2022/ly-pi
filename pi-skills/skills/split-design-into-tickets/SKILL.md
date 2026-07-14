---
name: split-design-into-tickets
description: Use when a user asks to split a design document or spec into Linear-style markdown tickets, or when breaking a design.md into actionable implementation tickets.
---

# Split Design into Tickets

## Overview

Convert a single design document into a set of markdown ticket files. Each ticket maps to one implementation unit from the design, uses a consistent YAML metadata block, and keeps acceptance criteria in Gherkin form.

By default, generated tickets are written in Chinese. If the user explicitly asks for English tickets, switch all body content and natural-language fields (titles, labels, scenarios) to English.

## When to Use

Use this skill when:
- The user says "split", "break down", or "convert" a `design.md`, `spec.md`, or similar design document into tickets.
- The target format is Linear-style markdown tickets.
- The user wants implementation-ready tickets derived from an existing design.

Do NOT use for:
- Creating a single design document from scratch (write the design, not tickets).
- Jira, GitHub Issues, or other ticket formats unless the user explicitly asks for the Linear-style markdown ticket format described here.

## Output Location

Place generated tickets in a `tickets/` directory. Use this precedence:
1. `docs/tickets/` if the project already has a `docs/` directory.
2. `tickets/` at the project root otherwise.

Never put ticket files directly next to the source design file unless the user explicitly requests it.

## Ticket File Format

### 1. One ticket per implementation unit

- Map each distinct module, feature, or work item in the design to exactly one ticket file.
- Do NOT create an extra "epic" or "parent" ticket unless the design itself explicitly defines one.
- Do NOT turn "Out of Scope" items into tickets.

### 2. YAML frontmatter (required)

Each file starts with YAML frontmatter using exactly these fields:

```yaml
---
Title: <concise ticket title>
ID: <sequential number: 001-999 zero-padded, then 1000+>
Status: TODO
Labels: <comma-separated labels>
Estimate: <1 | 2 | 3 | 5 | 8 | 13>
Depends: <comma-separated ticket IDs or empty>
PHASE: <number>
CYCLE: <number>
Source: <path-to-source-design-file>
---
```

- `ID` is the sequential number from the directory name prefix. For `001`–`999`, use 3-digit zero padding. If the count exceeds `999`, continue with `1000`, `1001`, and so on without renumbering or repadding existing `001`–`999` tickets. It is unique for each ticket.
- `Status` is always `TODO` for new tickets.
- `Labels` come from the design module or inferred categories (e.g., `后端, 推送通知`).
- `Estimate` is one of `1`, `2`, `3`, `5`, `8`, `13`. If the design lacks sizing, infer from scope and note it briefly to the user.
- `Depends` lists comma-separated ticket IDs that must be completed before this ticket. If there are no dependencies, leave it empty.
- `PHASE` and `CYCLE` are sequential numbers. If the design does not define phases/cycles, default to `PHASE: 1` and `CYCLE: 1` for all tickets.
- `Source` is the relative path to the design file the ticket was generated from (e.g., `docs/design.md`, `design.md`).

Do not add extra fields like `priority`, `assignee`, or `parent` unless the user specifically requests them. `Depends` is the only optional dependency field.

### 3. Body structure

After the frontmatter, the body must follow this exact order:

```markdown
# <标题重复>

## 用户故事

作为<角色>，我希望<功能>，以便<期望结果>。

## 范围

### 包含
- <本工单负责实现的内容>
- ...

### 不包含
- <本工单明确不处理的内容>
- ...

## 验收标准

### 场景 1：<名称>

Given <上下文>
When <动作>
Then <预期结果>

### 场景 2：<名称>

...

## 遗留问题（可选）

- <需要决策或进一步澄清的问题>
- ...

## 后续工单（可选）

- <后续工作描述或已创建工单 ID>
- ...

## 参考链接

- <链接标题或描述>(<url>)
```

#### 范围规则
- 在「用户故事」之后、「验收标准」之前插入「范围」章节。
- 使用两级小节：`### 包含` 和 `### 不包含`。
- 「包含」列出本工单负责实现的功能、模块或行为边界。
- 「不包含」列出设计明确排除、本工单不处理的内容，避免范围蔓延。
- 如果设计没有明确的不包含项，写 `无` 或 `暂无`；如果包含项也无需特别说明，写 `按验收标准执行`。

#### 用户故事规则
- 使用固定句式：`作为<角色>，我希望<功能>，以便<期望结果>。`
- 如果设计只提供一个全局用户故事，则为每个工单复用该故事。不要为每个工单编造不同的用户故事。
- 如果设计缺少用户故事，则根据模块目的推导一个，并保持上述句式。

#### 验收标准规则
- 将设计中的每个验收标准转换为 Gherkin 的 `Given/When/Then` 场景。
- 每个标准一个场景。如果标准包含多个部分，拆分为多个场景。
- 不要将验收标准保留为普通项目符号或复选框。

#### 参考链接规则
- 包含对应设计模块中提到的所有第三方文档链接。
- 如果模块没有链接，则完全省略「参考链接」部分；不要添加设计中不存在的链接。

#### 遗留问题规则（Open Questions）
- 位于「验收标准」之后、「后续工单」之前；仅在设计存在未决问题时才添加。
- 使用无序列表，每条写一个需要决策、澄清或进一步调研的问题。
- 如果设计没有遗留问题，则完全省略本章节。

#### 后续工单规则（Next Tickets）
- 位于「遗留问题」之后、「参考链接」之前；仅在设计提及后续工作时才添加。
- 使用无序列表，每条可以是后续工作描述，也可以是已创建工单的 ID（如 `#012`）。
- 如果设计没有明确后续工单，则完全省略本章节。

## File Naming

Each ticket lives in its own directory under `tickets/` (or `docs/tickets/`). Use kebab-case and a sequential prefix for the directory name, and always place the ticket content in `ticket.md`:

```
tickets/001-<module-name>/ticket.md
tickets/002-<module-name>/ticket.md
```

If the count exceeds `999`, continue with `tickets/1000-<module-name>/ticket.md` (and so on) without renumbering earlier tickets.

If the project already numbers design sections, reuse those numbers for the prefix.

## Common Mistakes

| Mistake | Fix |
|--------|-----|
| "No time for Gherkin, I'll use bullets" | Acceptance criteria must be Gherkin scenarios. This is non-negotiable. |
| "The user wants Jira format" | Unless the user explicitly rejects the Linear-style format, follow this skill. If they reject it, do not use this skill. |
| "I'll add an epic ticket for grouping" | Do not create parent/epic tickets unless the design explicitly defines one. |
| "Out of Scope items should still be tracked" | Do not turn out-of-scope items into tickets. |
| "I'll add Implementation Notes to be helpful" | Do not add sections not in the design. Stick to User Story, Scope, Acceptance Criteria, and optional Open Questions / Next Tickets / References. |
| "I'll put files next to the design doc" | Use `docs/tickets/` or `tickets/` at project root. |
| "I'll put the markdown directly in `tickets/001-xxx.md`" | Use `tickets/001-xxx/ticket.md` instead. |

## Red Flags — STOP and Re-read This Skill

- You are about to skip YAML frontmatter.
- You are about to use bullet points instead of Gherkin. (Acceptance criteria must still be Gherkin; Scope, Open Questions, and Next Tickets may use bullets.)
- You are about to create an epic or parent ticket.
- You are about to place ticket files next to the design source.
- You are about to place the ticket markdown directly in `tickets/000-xxx.md` instead of `tickets/000-xxx/ticket.md`.
- The user asked for a different format and you are still applying this skill.

## Example

Source design module:

```markdown
### 2. In-App Inbox

Build a persistent inbox where users can view, archive, and mark notifications as read.

**Acceptance Criteria:**
- Users can paginate through inbox items with 50ms response time.
- Read/archive state syncs across devices.
- Unread count badge updates in real time.

**Related Documents:**
- https://reactnative.dev/docs/flatlist
```

Generated ticket (`tickets/002-in-app-inbox/ticket.md`):

```markdown
---
Title: 应用内收件箱
ID: 002
Status: TODO
Labels: 前端, 移动端, 通知
Estimate: 5
Depends: 001
PHASE: 1
CYCLE: 1
Source: design.md
---

# 应用内收件箱

## 用户故事

作为用户，我希望在一个地方查看和管理我的通知，以便及时了解信息而不被淹没。

## 范围

### 包含
- 构建持久化的应用内收件箱
- 支持查看、归档和标记通知为已读
- 分页加载、状态同步、未读 badge 实时更新

### 不包含
- 邮件/短信推送通道
- 通知的创建与路由策略
- 第三方社交账号通知聚合

## 验收标准

### 场景 1：分页浏览收件箱

Given 用户收件箱中有通知
When 用户滚动收件箱时
Then 项目会分页加载，且每页加载时间不超过 50ms

### 场景 2：同步已读和归档状态

Given 用户已在多个设备登录
When 用户在一个设备上阅读或归档通知时
Then 所有设备都会反映该状态

### 场景 3：更新未读 badge

Given 用户有未读通知
When 新通知到达或用户标记通知为已读时
Then 未读数量 badge 会实时更新

## 参考链接

- [React Native FlatList](https://reactnative.dev/docs/flatlist)
```
