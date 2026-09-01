---
name: daily-timesheet
description: 汇总最近 N 天的工时填报（timesheet）：动态扫描最近更新的 PR，从 commits 中筛出自己的提交，按天分组、每天按 commit 数占比把总工时（默认 8h、0.5h 步长）分配到各 ticket；确认 Productive service 和写入预览后创建 draft time entries。当用户要"统计昨天/最近 N 天在各任务上花了多少时间"、"填工时/日报/周报/timesheet"时使用。
---

# Daily Timesheet

把最近 N 天的工作变成按天分组的工时清单。GitHub PR 中自己的 commits 提供活动证据；确认后将分配结果写入 Productive draft time entries。

## 参数（用户可覆盖，未提则用默认）

| 参数       | 默认                   |
| ---------- | ---------------------- |
| 窗口       | 最近 N 天，N=1（昨天） |
| 每天总工时 | 8h                     |
| 步长       | 0.5h                   |

## 步骤

### 0. 检查 Productive MCP 连接

调用 MCP gateway 状态检查（`mcp({})`）。只有 `productive` 显示为 `connected` 时才继续步骤 1。

若 `productive` 缺失、未连接，或状态查询失败，停止本次流程并告知用户：`Productive MCP 未连接。请先在 Pi 中连接 Productive 并完成 OAuth 授权，然后重新运行 daily-timesheet。`

完成标准：已确认 `productive` 为 `connected`；否则已停止，未执行任何 GitHub 查询。

### 1. 确定身份与每天的 UTC 窗口

```bash
gh api user --jq .login
git config user.email
```

commit author 的 login 或 email 任一匹配即算"自己的"。

`committedDate` 是 UTC，按本地时区换算每天的窗口。例如本地 UTC+8，日期 D 的窗口是 `[D-1T16:00:00Z, DT16:00:00Z)`。窗口整体范围 = 最早一天的起点到今天的零点。

完成标准：拿到 login、email、每一天的 UTC 窗口。

### 2. 动态探测 PR 列表

按 `updatedAt` 从新到旧分批拉取，逐步扩大 limit：

```bash
gh pr list --state all --limit <30|60|100> --search "sort:updated-desc" \
  --json number,title,updatedAt,state,author
```

- 每批拉完检查最后一个 PR 的 `updatedAt`：已早于窗口起点即停，否则扩大 limit 再拉（30 → 60 → 100）
- 上限 100 个；达到上限仍未覆盖窗口起点时，继续执行但在结果中警告"窗口超出扫描覆盖范围，更早日期可能漏报"
- `--state all` 必须带：默认只列 open，窗口内 merge/close 的 PR 会漏掉
- 停止条件不会漏扫：push commit 会刷新 PR 的 `updatedAt`，`updatedAt` 早于窗口起点的 PR 不可能含有窗口内的 commit。采用动态探测而非"窗口天数 × 固定系数"，是因为 PR 更新密度极不均匀（实测每天 0~7 个），固定系数会在高峰期漏扫

完成标准：PR 列表的 `updatedAt` 范围覆盖整个窗口。

### 3. 逐 PR 筛出自己的 commit

对每个 PR 执行：

```bash
gh pr view <num> --json commits --jq \
  '.commits[] | [.oid[0:8], .committedDate, (.authors[0].login // "-"), (.authors[0].email // "-"), .messageHeadline] | @tsv'
```

过滤条件：author login/email 匹配（步骤 1）且 `committedDate` 落在某一天的 UTC 窗口内，归入该天。按 commit author 过滤而非 PR author——别人 PR 里可能有自己的 commit，自己 PR 里也可能有别人的。为每个分配任务保留 PR 标题和去重后的命中 `messageHeadline`，供步骤 6 生成内容总结；不能只保留 commit 数。

完成标准：每一天的命中 commit 列表（按 PR 分组）。

### 4. 按天分配工时

每一天独立分配，规则相同：

1. `raw = 每天总工时 × (任务当日 commit 数 / 当日总 commit 数)`
2. round 到最近的步长倍数
3. 取整后总和 ≠ 当天总工时时，调整占比最大的任务，使总和精确等于当天总工时

commit 时间戳是推送时刻（批量推送会挤在同一分钟），不反映实际工作时长——只用 commit 数做权重，不用时间跨度估算。

### 5. 确定 Productive service

先调用 `productive_get_current_person_and_organization()`，取得当前 Productive person。GitHub 身份只用于筛 commit，不能作为 Productive person。

先用 `productive_describe_resource` 检查 `bookings`、`services` 与 `time_entries` 的字段，并加载 `time-entry-logging` 与 `work-booking` 的 Productive 指引。当前账号不能读取 Deal，因此候选和回执只显示 service 名、关联 task（如有）及排期信息，不显示 Deal 名或内部 ID。

对每个有分配工时的本地日期 D，独立查询当前 person 的 Scheduled on：`bookings` 使用 `person=current`、`booking_type=service`、`is_canceled=false`、`with_draft=true`、`after=D` 与 `before=D`；请求 `started_on`、`ended_on`、`booking_method`、`time`、`percentage`、`total_time`、`service.name` 与 `task.title`。`after`/`before` 要覆盖 D，因而包含跨多日的 booking。

查询失败、`items` 缺失或不是数组、或 booking/service 数据结构异常时，将该操作标为 `Blocked: Scheduled on <D>`，阻断整批 Productive 预检、最终确认和所有写入。不要把技术查询失败视为没有排期。

对有效 booking 按 service ID 在日期 D 内去重；同一 service 的多条 booking 只形成一个候选。显示每个候选的 service 名、关联 task（如有）和排期摘要：按天 booking 显示每天时长及整个 booking 的工作日总时长，百分比 booking 显示百分比，total-hours booking 显示总时长。候选不展示内部 ID。

- 没有有效 Service booking：将日期 D 标为 `Not scheduled: no Scheduled on`，不为 D 生成预检候选或写入项，继续处理其他日期
- 恰有一个 Service：展示排期并要求用户确认；用户拒绝时将 D 标为 `Not scheduled: selection cancelled`
- 有多个 Service：展示候选并要求用户显式选择一个；取消或无选择时将 D 标为 `Not scheduled: selection cancelled`
- 若多个不同 service 的用户可见标签完全相同而无法区分：将 D 标为 `Not scheduled: ambiguous Scheduled on`；不展示内部 ID

对确认或选择的 Scheduled on service，以当前 person、`time_tracking_enabled=true` 和精确 service name 查询 `services`，每页最多 200 条；使用返回的 `query_id` 与 `next_offset` 持续读取该精确名称的后续页，直到找到相同 service ID 或没有更多结果。只有找到相同 ID 才可用于 D；查询成功但未找到该 ID、只找到同名不同 ID 或所选 service 不可记工时时，将 D 标为 `Not scheduled: service unavailable`。绝不以同名的其他 service 替代选中项。该 revalidation 查询失败或结构异常时为 `Blocked`，阻断整批。

为每个未跳过日期保存其经用户确认且当前可记工时的 service；不创建持久映射，也不把 GitHub ticket 映射到 Productive task。绝不读取历史 `time_entries` 来寻找 service，绝不要求或执行关键词或短语搜索。

完成标准：每个有分配工时的日期都已关联唯一、经用户确认且当前可记工时的 Scheduled on service，或已作为 `Not scheduled` 跳过；若有 `Blocked`，未写入任何 Productive 记录。

### 6. 预检并展示写入计划

每个已关联 Scheduled on service 的日期、每个分配出的 ticket（或既有的无 ticket 短语）对应一条候选 time entry。`Not scheduled` 日期不生成候选或写入项，但必须保留在最终回执中。针对该任务的 PR 标题和去重后的命中 commit headlines，生成一条具体、忠实且保留源语言的 LLM 总结：说明主要改动及其对象，不虚构未在来源中出现的信息。note 只使用一行：

```text
<ticket-or-label> <content>
```

其中 `<content>` 是该总结；必须非空且只有一行，不要加入日期、`[daily-timesheet]` marker、隐藏标记或额外前缀。summary LLM 超时、不可用、返回空值、多行或不符合这些约束时，标为 `Blocked`：展示 ticket/标签与原因，阻止整批写入；这不是可由用户覆盖的 `Review`。

对每个 `日期 + 已确认 Scheduled on service` 组合，查询当前 person、该 service 与同一日历日期的现有 `time_entries`，读取 `date`、`time` 和 `note`；如有分页，取完所有页。任何查询或分页失败、缺少或非数组 `items`、或无法完整读取既有 entry 数据的响应均为 `Blocked`，不展示最终确认且不创建任何记录；绝不将其视为空结果。只将候选与相同日期、相同 service 的既有 note 比较；先完成整批比较再归类，不得逐候选独立归类。每一对比较必须返回恰好一个 `Same`、`Different` 或 `Uncertain`，以及非空的简短理由。LLM 超时、不可用、空响应、格式错误、多个分类或缺少理由时，标为 `Blocked`。有效的 `Uncertain` 才进入 `Review`。`ticket-or-label` 是弱身份信号：一致支持 `Same`，不一致或缺失仅降低判断可信度，不单独否决语义匹配。

- 候选只有一个 `Same`，且该既有 note 未被其他候选判为 `Same`：分钟数相同标为 `Skip`，分钟数不同标为 `Conflict`；都不改动既有记录
- 全部为 `Different`：标为 `Create`
- 有 `Uncertain`、一个候选有多个可能的 `Same`，或同一既有 note 被多个候选判为 `Same`：所有受影响候选标为 `Review`；预览中展示拟写入 note、所有相关既有 note 和 LLM 理由，逐项询问用户选择 `Create`、`Skip` 或 `Cancel`（终止本次写入）

人工记录也参与内容判断，但绝不被覆盖或删除。任何 `Blocked` 都要显示预检原因，不展示最终确认，也不得对本次运行的任何候选调用 `productive_create_resource`。只有没有 `Blocked` 且所有 `Review` 均被用户处理后，才生成最终 `Create` 列表。

先输出 Productive 预览：每个未跳过日期的已确认 Scheduled on service、每个 `Not scheduled` 日期及其原因，以及每条 `Create`、`Skip`、`Conflict`、`Review`、`Blocked` 的日期、service、ticket/标签、分钟数、note 和理由。只有没有 `Blocked` 时才明确询问是否创建所有最终 `Create` 项；只有本次得到肯定答复才继续步骤 7。取消、拒绝或无答复时停止写入，并保留预览。

完成标准：所有未跳过日期的候选已分类、没有 `Blocked`、所有 `Review` 已由用户处理，且所有 `Not scheduled` 日期已列出原因；未得到本次明确确认前，未调用任何写入操作。

### 7. 创建 draft time entries

仅在预检没有 `Blocked` 且获得明确确认后，使用 `productive_create_resource` 批量创建仅有的 `Create` 项。每项只提供：

- 当前 Productive person
- 该项日期的已确认 Scheduled on service
- 本地日历日期 `YYYY-MM-DD`
- `time: { value: <minutes>, unit: "minute" }`
- 步骤 6 的 `<ticket-or-label> <content>` note

不要提供 Productive task，也不要提供 `billable_time`——这与用户在网页中只填写 `time` 和 `note` 的方式一致，由 Productive 保持默认行为。不要创建 `timesheets`：它是按日提交标记；本流程只创建 draft time entries，绝不提交、审批、更新或删除记录。

如遇权限、日期锁、财务锁、验证或部分写入错误，记录受影响的日期和标签并如实报告；不要通过重试、更新、删除、提交或审批绕过问题。

完成标准：每个 `Create` 项都在返回结果中标为 `Created` 或 `Failed`；已有记录没有被修改。

### 8. 输出

先按天分组，日期按时间正序（从旧到新）。每天一段：日期标题 + 每个任务两行（ticket 行 + summary 行）+ Total 行：

```
## 2026-08-23

0m 无 commit 记录

## 2026-08-24

<ticket> <minutes>m
<summary>

Total: <sum>m (<hours>h)
```

- ticket 从 PR 标题提取（如 `JOGG-709`）；无 ticket 时用短语概括 PR 标题
- summary 沿用 PR 标题内容，可压缩
- 无 commit 的日期占位一行：`0m 无 commit 记录`——让填报者看到完整周期，能发现"周五怎么没提交"这类异常

随后追加 Productive 回执：

```
## Productive

Scheduled: <date> <service> — <booking summary>
Not scheduled: <date> — <reason>
Created: <date> <service> <ticket-or-label> <minutes>m
Skipped: <date> <service> <ticket-or-label> <minutes>m
Conflict: <date> <service> <ticket-or-label> existing <minutes>m, proposed <minutes>m
Review: <date> <service> <ticket-or-label> — <reason or user decision>
Blocked: <date or operation> — <reason>
Failed: <date> <service> <ticket-or-label> — <reason>
```

仅列出实际存在的类别；若有 `Blocked`，明确写 `Not written: preflight blocked`；若用户在 `Review` 中选择 `Cancel`，明确写 `Not written: review cancelled`；否则若用户未确认写入，明确写 `Not written: confirmation not received`。

## 盲区提醒（随结果一并告知用户）

- 窗口内 merge/review 的 PR（commits 在窗口之前）不产生当日 commit，不在清单内——这类活动也是工作，提醒用户自行决定是否计入
- 某天任务数 < 2 时，纯占比分配会把全天工时压到一个任务上，提醒人工核对该天的分配
- 动态探测达到 100 个 PR 上限仍未覆盖窗口起点时，明确警告哪些日期可能漏报
- Productive 同步只登记 GitHub commit 推导出的分配；`Not scheduled` 日期、其他工作以及任何 `Conflict`、`Review` 或 `Blocked` 都需要用户决定是否手动登记

## 示例推演

2026-08-24 使用默认每天总工时 8h，Allocation Rule 结果为：

| ticket | 分配 | PR 标题 | 去重后的命中 headline | LLM content |
| --- | ---: | --- | --- | --- |
| `JOGG-730` | 120m | `support semicolon outfit items` | `accept semicolon delimiters`; `add parser regression coverage` | `Support semicolon-delimited outfit items and add parser regression coverage` |
| `JOGG-731` | 120m | `retain outfit filters` | `keep filters after refresh` | `Keep outfit filters after refresh` |
| `JOGG-732` | 120m | `add outfit audit view` | `render outfit change events` | `Add an audit view for outfit changes` |
| `JOGG-733` | 120m | `clarify outfit import recovery` | `document import recovery` | `Clarify recovery for outfit imports` |

四项合计 480m。

### Scheduled on selection

对 2026-08-24，技能以当前 person、`booking_type=service`、`is_canceled=false`、`with_draft=true`、`after=2026-08-24` 与 `before=2026-08-24` 查询 `bookings`。它返回一个有效 booking，用户看到：

```text
Internal Tools — JOGG-730 setup — 8h/day × 1 working day = 8h total
```

用户确认后，技能以当前 person、`time_tracking_enabled=true` 和精确名称 `Internal Tools` 查询 `services`，并只在返回的同名 service 中找到原 booking 的相同 ID 时才保留此选择；内部 ID 从不展示。

对另一有分配工时的日期 2026-08-25，若当天有两个不同的有效 service，技能展示两个 booking 摘要并要求用户手选，例如：

```text
Developer — client dashboard — 4h/day × 1 working day = 4h total
Internal Tools — 无关联 task — 4h/day × 1 working day = 4h total
```

用户选择 `Internal Tools` 后，只有 2026-08-25 的候选 entry 使用该 service。若当天没有有效 Service booking、用户取消选择、所选 service 不再可记工时，或多个不同 service 的可见标签完全相同，技能将该日期写为 `Not scheduled` 并跳过该日期；其他日期继续预检。它绝不读取历史 time entry，也不要求或执行关键词或短语搜索。

任一日期的 booking 查询、booking 数据或 service revalidation 查询失败或结构异常时，预检为 `Blocked`，不展示最终确认且不创建任何记录。

拟写入 note、同日既有 entry 和 LLM 理由如下：

| 拟写入 note | 相关既有 entry | LLM 判断与理由 | 分类/决定 |
| --- | --- | --- | --- |
| `JOGG-730 Support semicolon-delimited outfit items and add parser regression coverage` | 同 note，120m | `Same`：ticket 与内容一致 | `Skip` |
| `JOGG-731 Keep outfit filters after refresh` | 同 note，180m | `Same`：ticket 与内容一致 | `Conflict` |
| `JOGG-732 Add an audit view for outfit changes` | `JOGG-732 Remove obsolete outfit exports`，120m | `Different`：改动目标不同 | `Create` |
| `JOGG-733 Clarify recovery for outfit imports` | `JOGG-733 Document outfit import retry handling`，120m | `Uncertain`：内容相近但无法确认是否同一工作 | `Review`，用户选 `Create` |

最终预览包含两个 `Create`、一个 `Skip`、一个 `Conflict` 和一个已处理的 `Review`。用户确认创建后，只有 `JOGG-732` 与 `JOGG-733` 被创建。创建项没有 Productive task、`billable_time` 或 timesheet 操作；既有记录保持不变，回执包含 `Review` 决定。

### Review → Skip

在另一次预检中，`JOGG-734` 与两条既有 entry 都被 LLM 判为 `Same`，因此不能自动复用任一记录而进入 `Review`。预览展示两条既有 note 与理由；用户选择 `Skip` 后，`JOGG-734` 不进入最终 `Create` 列表，既有记录保持不变。

### Review → Cancel

在另一次预检中，同一条既有 entry 被 `JOGG-735` 和 `JOGG-736` 都判为 `Same`，两个候选均进入 `Review`。用户对任一项选择 `Cancel` 后，流程不展示最终确认，也不调用 `productive_create_resource`；回执写 `Not written: review cancelled`。
