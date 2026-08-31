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

先用 `productive_describe_resource` 检查 `services` 与 `time_entries` 的字段，并加载 `time-entry-logging` 的 Productive 指引。然后要求用户给出一个非空 service 关键词（一个词）；不要从仓库名、目录名或完整 service 列表推测候选。

以当前 person、`time_tracking_enabled=true` 和该关键词查询 `services`，请求 service name 与 deal name，且 `limit` 固定为 2。绝不分页：

- `pagination.total = 0`：告知没有匹配，要求一个更具体或不同的关键词
- `pagination.total > 1` 或出现下一页：告知关键词不唯一，要求一个更具体的关键词；不展示、枚举或人工选择这些候选
- 只有一个结果：展示其 `deal > service`，询问用户是否正确；用户拒绝时丢弃结果并重新要求关键词

用户确认的唯一 service 只用于本次运行；不创建持久映射，也不把 GitHub ticket 映射到 Productive task。

完成标准：当前 Productive person 和唯一、经用户确认的 `deal > service` 已确定；否则停止，未写入任何 Productive 记录。

### 6. 预检并展示写入计划

每个有 commit 的日期、每个分配出的 ticket（或既有的无 ticket 短语）对应一条候选 time entry。针对该任务的 PR 标题和去重后的命中 commit headlines，生成一条具体、忠实且保留源语言的 LLM 总结：说明主要改动及其对象，不虚构未在来源中出现的信息。note 只使用一行：

```text
<ticket-or-label> <content>
```

其中 `<content>` 是该总结；不要加入日期、`[daily-timesheet]` marker、隐藏标记或额外前缀。

在整个 Evidence Window 查询当前 person、已确认 service 的现有 `time_entries`，读取 `date`、`time` 和 `note`；如有分页，取完所有页。对每条候选，仅将同一日历日期的既有 note 与拟写入 note 交给 LLM 做内容判断，输出 `Same`、`Different` 或 `Uncertain` 与简短理由：

- 单一 `Same` 且分钟数相同：标为 `Skip`，不改动
- 单一 `Same` 但分钟数不同：标为 `Conflict`，不改动，列出已有值与拟写入值
- 全部为 `Different`：标为 `Create`
- 有 `Uncertain` 或多个可能的 `Same`：标为 `Review`；预览中展示拟写入 note、相关既有 note 和 LLM 理由，逐项询问用户选择 `Create`、`Skip` 或 `Cancel`（终止本次写入）

人工记录也参与内容判断，但绝不被覆盖或删除。只有所有 `Review` 均被用户处理后，才生成最终 `Create` 列表。

先输出 Productive 预览：已确认的 `deal > service`，以及每条 `Create`、`Skip`、`Conflict`、`Review` 的日期、ticket/标签、分钟数、note 和理由。然后明确询问是否创建所有最终 `Create` 项；只有本次得到肯定答复才继续步骤 7。取消、拒绝或无答复时停止写入，并保留预览。

完成标准：所有候选已分类，所有 `Review` 已由用户处理；未得到本次明确确认前，未调用任何写入操作。

### 7. 创建 draft time entries

获得明确确认后，使用 `productive_create_resource` 批量创建仅有的 `Create` 项。每项只提供：

- 当前 Productive person
- 已确认 service
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

Service: <deal> > <service>
Created: <date> <ticket-or-label> <minutes>m
Skipped: <date> <ticket-or-label> <minutes>m
Conflict: <date> <ticket-or-label> existing <minutes>m, proposed <minutes>m
Review: <date> <ticket-or-label> — <reason or user decision>
Failed: <date> <ticket-or-label> — <reason>
```

仅列出实际存在的类别；若用户未确认写入，明确写 `Not written: confirmation not received`。

## 盲区提醒（随结果一并告知用户）

- 窗口内 merge/review 的 PR（commits 在窗口之前）不产生当日 commit，不在清单内——这类活动也是工作，提醒用户自行决定是否计入
- 某天任务数 < 2 时，纯占比分配会把全天工时压到一个任务上，提醒人工核对该天的分配
- 动态探测达到 100 个 PR 上限仍未覆盖窗口起点时，明确警告哪些日期可能漏报
- Productive 同步只登记 GitHub commit 推导出的分配；其他工作以及任何 `Conflict` 或 `Review` 都需要用户决定是否手动登记

## 示例推演

假设用户先输入关键词 `audit`，查询没有结果；技能要求另一个关键词。输入 `status` 后有多个结果；技能不分页或列出候选，而是要求更具体的词。输入 `status-board` 后唯一结果为 `Status Board > Developer`，但用户指出不正确；技能再次要求关键词。输入 `internal-tools` 后唯一结果为 `Internal Tools > Developer`，用户确认正确；没有任何记录在此之前被创建。

2026-08-24 的 Allocation Rule 结果为：

- `JOGG-730` 240m；PR 标题 `support semicolon outfit items`；headlines 为 `accept semicolon delimiters` 与 `add parser regression coverage`
- `JOGG-731` 240m
- `JOGG-732` 240m
- `JOGG-733` 240m

LLM 为 `JOGG-730` 生成 content：`Support semicolon-delimited outfit items and add parser regression coverage`，因此拟写入 note 仅为：

```text
JOGG-730 Support semicolon-delimited outfit items and add parser regression coverage
```

同日的既有 notes 经 LLM 比较后：

- `JOGG-730` 的内容明确相同且为 240m，归类为 `Skip`
- `JOGG-731` 的内容明确相同但为 180m，归类为 `Conflict`
- `JOGG-732` 的内容明确不同，归类为 `Create`
- `JOGG-733` 的内容无法可靠判断，归类为 `Review`；预览显示理由和既有 note，用户选择 `Create`

最终预览包含两个 `Create`、一个 `Skip`、一个 `Conflict` 和一个已处理的 `Review`。用户确认创建后，只有 `JOGG-732` 与 `JOGG-733` 被创建。创建项没有 Productive task、`billable_time` 或 timesheet 操作；既有记录保持不变，回执包含 `Review` 决定。
