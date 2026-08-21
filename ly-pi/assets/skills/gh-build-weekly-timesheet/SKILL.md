---
name: gh-build-weekly-timesheet
description: 从 GitHub PR 提交证据生成可审计的周工时表。手动调用此技能以汇总近期或指定日期范围内的票据、工时估算和中英双语进度。
compatibility: Requires Python 3.9+ and an authenticated gh CLI.
disable-model-invocation: true
---

# Build a Weekly PR Timesheet

从 GitHub 提交证据生成每日工时表。始终将观察到的活动与估算工时分开。

## 默认范围

除非调用者另有说明：

- 使用当前 Git 仓库与当前 `gh` 账户。
- **证据窗口**为本地时区中本周周一到今天（两端包含）。
- 采集器会扫描该仓库中该账户创建的全部 PR 及其分页提交，以避免历史日期范围因“最近 PR”上限而漏记。
- 请求完整工时表时，每个有证据日期默认分配 8 小时，按 0.5 小时增量估算。
- 只有当调用者要求双语输出或本轮已使用中英双语时，才输出中英双语摘要。

先陈述将采用的范围、时区和工时规则；默认值足够时不要为此阻塞提问。

## 收集证据

从技能目录运行采集器：

```bash
python3 scripts/collect_pr_activity.py
```

指定任意闭合日期范围：

```bash
python3 scripts/collect_pr_activity.py \
  --start-date 2026-08-03 \
  --end-date 2026-08-14
```

- `--start-date` 与 `--end-date` 必须成对传入，不能反向或晚于今天。
- 旧的 `--week-start YYYY-MM-DD` 仍可使用；它统计到该周结束日或今天（取较早者），且不能与显式日期范围混用。
- 按需传入 `--repo OWNER/REPO`、`--author LOGIN`、`--timezone IANA_NAME` 或 `--include-all-commit-authors`。
- 未指定 `--timezone` 时，采集器使用运行 Pi 的系统本地时区。

采集器通过 `gh api` 读取 GitHub 数据；较长历史范围可能需要很多只读请求。若 GitHub 访问被拦截，请请求运行相同 `gh` 查询的网络权限。绝不打印 token 或批量环境变量。

以 JSON 输出为事实来源：

- `activities` 按本地日期、票据和 PR 分组。
- `calendar_days` 列出证据窗口内的每个日历日及其 `has_activity` 状态。
- `date_range` 是实际使用的闭合日期范围。
- `work_commit_count` 排除机械 merge commit；`commit_count` 保留它们以便审计。
- `first_time` 与 `last_time` 是观察点，不是实际工时。
- `UNASSIGNED` 表示存在活动但无法从 PR 或提交标题确定唯一票据。
- `duplicates_removed` 表示同一提交经多个 PR 出现而被去重的次数。

先检查提交标题，再写摘要。PR 标题和分支名只能提供上下文，不能证明实际耗时。

## 分配估算工时

仅当调用者要求工时或完整工时表时分配。调用者可用自然语言覆盖规则，例如：“2026-08-03 到 2026-08-14，每个有证据日期 7.5h，按 0.25h 分配；8 月 7 日按 4h。”

1. 每个有 GitHub 证据的日历日（包括周末）按该日目标工时分配；无证据日期始终为 `NO_ACTIVITY | 0h`。
2. 每日各条目的估算值必须按指定增量相加后精确等于该日目标。若目标无法由增量精确表示，要求调用者澄清。
3. 衡量提交数量、范围广度、实现复杂度、审查/冲突处理和活动顺序；不要只按提交数等比例分配。
4. 为短小的 review fix 分配少量可信时间。
5. `UNASSIGNED` 单独参与当天总额分配，绝不悄悄并入附近票据；提示用户人工决定最终归账。
6. 不叠加 `first_time` 到 `last_time` 的时间跨度。

所有小时都必须标为基于提交证据的估算值。

## 写摘要

为每个日期—票据区块写一条短小、结果导向的摘要：

- 从 PR 标题和提交标题推导行为或调查结论，而非提交数量。
- 保留 NeoDay、Deployteq、SQS、voucher-used 等标识符。
- 双语时中文在前、自然英文在后；每种语言各一条简洁句子。
- 除非提交能证明，否则不要声称已部署、完成或产生生产影响。
- `NO_ACTIVITY` 行使用“没有 GitHub 活动证据”而不是伪造任务摘要。

## 呈现结果

返回每日表，其中包含证据窗口内每一个日历日：

| Date / 日期 | Ticket / 票据 | Estimated hours / 估算工时 | Summary / 摘要 |
|---|---|---:|---|

- 有活动日期按票据列出；无活动日期使用 `NO_ACTIVITY` 与 `0h`。
- `NO_ACTIVITY` 不进入票据总计表。
- 另附按票据的总计表；`UNASSIGNED` 保持独立并标出人工归账需求。

最后附上：

> Hours are reasonable estimates for timesheet use; commit timestamps prove activity, not actual elapsed work.
