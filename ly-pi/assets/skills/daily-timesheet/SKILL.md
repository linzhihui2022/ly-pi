---
name: daily-timesheet
description: 汇总最近 N 天的工时填报（timesheet）：动态扫描最近更新的 PR，从 commits 中筛出自己的提交，按天分组、每天按 commit 数占比把总工时（默认 8h、0.5h 步长）分配到各 ticket，输出 `<ticket> <分钟>m + 摘要` 清单。当用户要"统计昨天/最近 N 天在各任务上花了多少时间"、"填工时/日报/周报/timesheet"时使用。
---

# Daily Timesheet

把最近 N 天的工作变成按天分组的工时清单。数据源：当前仓库最近更新的 PR 中自己的 commits。

## 参数（用户可覆盖，未提则用默认）

| 参数 | 默认 |
|---|---|
| 窗口 | 最近 N 天，N=1（昨天） |
| 每天总工时 | 8h |
| 步长 | 0.5h |

## 步骤

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
  '.commits[] | "\(.oid[0:8])\t\(.committedDate)\t\(.authors[0].login // "-")\t\(.authors[0].email // "-")\t\(.messageHeadline)"'
```

过滤条件：author login/email 匹配（步骤 1）且 `committedDate` 落在某一天的 UTC 窗口内，归入该天。按 commit author 过滤而非 PR author——别人 PR 里可能有自己的 commit，自己 PR 里也可能有别人的。

完成标准：每一天的命中 commit 列表（按 PR 分组）。

### 4. 按天分配工时

每一天独立分配，规则相同：

1. `raw = 每天总工时 × (任务当日 commit 数 / 当日总 commit 数)`
2. round 到最近的步长倍数
3. 取整后总和 ≠ 当天总工时时，调整占比最大的任务，使总和精确等于当天总工时

commit 时间戳是推送时刻（批量推送会挤在同一分钟），不反映实际工作时长——只用 commit 数做权重，不用时间跨度估算。

### 5. 输出

按天分组，日期按时间正序（从旧到新）。每天一段：日期标题 + 每个任务两行（ticket 行 + summary 行）+ Total 行：

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

## 盲区提醒（随结果一并告知用户）

- 窗口内 merge/review 的 PR（commits 在窗口之前）不产生当日 commit，不在清单内——这类活动也是工作，提醒用户自行决定是否计入
- 某天任务数 < 2 时，纯占比分配会把全天工时压到一个任务上，提醒人工核对该天的分配
- 动态探测达到 100 个 PR 上限仍未覆盖窗口起点时，明确警告哪些日期可能漏报
