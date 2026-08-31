# daily-timesheet-productive-sync — 将 Daily Timesheet 写入 Productive

Status: ready-for-agent

Risk: High

Approval: 用户在本 Pi 会话确认本规格为后续拆票与实施范围，并明确授权将已验证的资源通过 `bun run deploy` 部署到 Pi；部署后仍须由用户执行 `/reload`。用户随后明确批准将 service 全量分页改为用户关键词的唯一匹配查询，并将 note 改为 `<ticket> <LLM 总结>`；同日同 service 的既有 note 由 LLM 语义识别，不确定项须进入 Review 由用户决定。此次 refinements 不含部署。Productive 写入仍须在每次运行的预览后获得本次明确确认。

## Problem Statement

Daily Timesheet 目前从 GitHub PR 的提交推导按日、按 ticket 的工时分配，但只输出人工填报清单。维护者仍需在 Productive 中逐条录入，既增加重复劳动，也容易使分配结果与实际登记不一致。

Productive 中没有可用于 ticket 映射的 task。工时记录必须关联可记工时的 service；因此系统不能假定 GitHub ticket 能直接映射到 Productive task。

## Solution

保留既有的 Evidence Window、GitHub 提交筛选、Allocation Rule 和按日输出。完成工时分配后，Daily Timesheet 要求用户给出一个 service 关键词，并仅在当前 Productive 用户可记工时的 service 中查询；只有唯一结果才会展示为 `deal > service` 并要求用户确认。

用户确认 service 后，技能先生成完整的 Productive 写入预览。获得本次明确确认才为每个“日期 + ticket”创建一条 draft time entry。每条 note 仅为 `<ticket-or-label> <content>`，其中 content 由 LLM 基于 PR 标题和去重后的命中 commit headlines 生成一条忠实、保留源语言的总结；不关联 Productive task，不创建或提交 timesheet，也不执行审批。技能只提供 `time` 与 `note`，让 Productive 保持网页录入时对 `billable_time` 的默认行为。

## User Stories

1. As a Daily Timesheet user, I want my GitHub-derived Allocation Rule results retained, so that Productive registration follows the same daily allocation I reviewed.
2. As a Daily Timesheet user, I want the skill to identify my current Productive identity, so that time is never recorded for another person.
3. As a Daily Timesheet user, I want the skill to inspect only services I can track time against, so that unavailable services are never proposed.
4. As a Daily Timesheet user, I want to provide one service keyword, so that the skill can find a target without reading a large service catalog.
5. As a Daily Timesheet user, I want a unique search result confirmed before any write, so that a keyword cannot misattribute my time.
6. As a Daily Timesheet user, I want to provide a different or more specific keyword when the result is absent or wrong, and a more specific keyword when it is ambiguous, so that service selection remains fast and deliberate.
7. As a Daily Timesheet user, I want each date and ticket allocation represented by its own time entry, so that the Productive note preserves the source allocation's traceability.
8. As a Daily Timesheet user, I want each note formatted as ticket plus an LLM summary of the PR title and commit headlines, so that it is informative without exposing an implementation marker.
9. As a Daily Timesheet user, I want a complete create/skip/conflict/review preview before writing, so that I can inspect all financial-impacting changes as a batch.
10. As a Daily Timesheet user, I want newly created entries to remain draft and unsubmitted, so that I retain the existing Productive submission and approval workflow.
11. As a Daily Timesheet user, I want an existing generated entry left unchanged, so that rerunning the skill never overwrites a manually corrected record.
12. As a Daily Timesheet user, I want one-to-one LLM semantic matching of same-day, same-service notes, a Review state for uncertainty or competing matches, and a blocked pre-write for technical LLM failures, so that ambiguous content never causes a silent duplicate or omission.
13. As a Daily Timesheet user, I want Productive locks, permission failures, and unavailable services reported clearly, so that I know which records still require manual action.
14. As a Daily Timesheet user, I want no-activity days and existing blind-spot reminders retained in the final result, so that Productive synchronization does not hide missing evidence or non-commit work.
15. As a Daily Timesheet user, I want the skill to state which entries were created, skipped, conflicted, reviewed, blocked, or failed, so that the final output is an auditable registration receipt.

## Implementation Decisions

- The Daily Timesheet skill remains the single workflow seam. It keeps the current GitHub collection and Allocation Rule steps, then adds a Productive synchronization phase after the allocation is known.
- Productive connection remains a prerequisite. The synchronization phase resolves the current Productive person and uses that person for all reads and creates; GitHub author identity is not reused as a Productive identity.
- For each run, the user provides one nonempty service keyword. The skill queries only services the current person can track time against with time tracking enabled, passes that keyword as the service query, requests at most two records, and never paginates this search.
- The query response must contain `items`. A failed or malformed response stops the run without writes. Zero items asks for a different or more specific keyword; `items.length !== 1` or a present `next_offset` means the keyword is ambiguous and asks for a more specific keyword.
- Exactly one item with no `next_offset` is presented as `deal > service`, but never authorizes a write. The user must explicitly confirm it. Rejection returns to a different or more specific keyword rather than listing or selecting from a broad service catalog.
- The selected service applies to the current run only. This feature does not add a persistent repository-to-service mapping, a task mapping, or a configuration file.
- Each allocated date and ticket creates one draft Productive time entry with the current person, confirmed service, allocation date, and minutes from the Allocation Rule. Its note is only `<ticket-or-existing-fallback-label> <content>`, where an LLM produces one faithful, source-language summary from the PR title and de-duplicated matching commit headlines.
- A generated summary must be nonempty, one line, and free of dates, markers, hidden prefixes, or unsupported content. Any failed, unavailable, or malformed summary generation marks the pre-write `Blocked`.
- The synchronization intentionally omits a Productive task and `billable_time`. Omitting `billable_time` preserves the default behavior of the user's existing web-based time entry flow.
- The skill does not create a Productive timesheet. A timesheet is a day-level submission marker, so creating one would change the user's submission workflow and may make entries non-editable.
- Before final confirmation, the skill queries existing time entries for the current person, selected service, and same calendar day. An LLM compares every candidate note with those notes as `Same`/`Different`/`Uncertain`. The ticket-or-label is a weak identity signal: a matching label supports `Same`, while a mismatched or missing label does not alone rule it out.
- A successful comparison returns exactly one category and a nonempty reason. `Uncertain` is a valid reviewable result; a timeout, unavailable LLM, empty or malformed response, multiple categories, or invalid summary marks the pre-write `Blocked`.
- Any `Blocked` result prevents final confirmation and every create in the current run. An existing entry can be automatically associated with at most one candidate. A candidate with multiple `Same` results, or an existing entry reported `Same` for multiple candidates, puts every affected candidate into Review.
- A unique, unclaimed `Same` with equal minutes is Skip; with different minutes Conflict. A candidate whose comparisons are all `Different` is Create; `Uncertain` is Review. Other manual entries remain unchanged.
- After the user explicitly confirms the preview, the skill bulk-creates only missing entries. It never updates, deletes, submits, approves, or unapproves Productive records.
- A Productive permission, date-lock, financial-lock, validation, or partial-write failure is reported with affected date and ticket labels. The skill does not retry by weakening safeguards or alter successfully existing entries.
- The final Daily Timesheet output retains its existing per-day summary and blind-spot reminders, then appends a concise synchronization receipt with created, skipped, conflicted, reviewed, blocked, and failed entries.

## Testing Decisions

- Test the workflow at the Daily Timesheet skill seam through a worked example rather than internal Productive implementation details. The example must begin with synthetic GitHub allocations and keyword-query outcomes for zero, ambiguous, and unique results, then show service confirmation, write preview, explicit final confirmation, and the resulting draft entries.
- The worked example must demonstrate that zero results and a rejected unique result accept a different or more specific keyword, while multiple items or `next_offset` require a more specific keyword; no broad service list is paginated or selected from.
- The example must prove external behavior for one date with multiple tickets: each allocation becomes a separate entry, their minutes sum to the configured daily total, and each note contains only ticket plus an LLM summary of its PR title and commit headlines.
- The example must prove that Productive task, `billable_time`, and timesheet submission are absent from generated entries and operations.
- The example must cover semantic same-content (skip), semantic same-content with different minutes (conflict), different content (create), uncertain or competing content (Review), and an unavailable or ambiguous service (stop for user choice). It must show Review `Create`, `Skip`, and `Cancel`; cancellation means no final confirmation or create.
- Validation must prove that an LLM timeout, unavailability, malformed response, invalid summary, or missing comparison reason is `Blocked` and prevents final confirmation and every create.
- Run the repository-wide verification command after the documentation changes. No new runtime code seam or external Productive write is needed to validate this skill-document update.

## Out of Scope

- Mapping individual tickets to Productive tasks or maintaining a persistent mapping table.
- Automatically selecting a service without user confirmation.
- Updating, deleting, submitting, approving, rejecting, unapproving, or otherwise mutating existing Productive entries.
- Changing the existing GitHub Evidence Window, commit filtering, Allocation Rule, ticket extraction fallback, or no-activity output.
- Creating Productive tasks, services, deals, or timesheets.
- Performing a real Productive write. The approved deployment was limited to copying the then-verified repository assets to Pi and requesting a user-run `/reload`.
- Deploying this keyword-search refinement; any new deployment requires separately recorded approval.

## Further Notes

- Productive time entries require a person, service, date, and time. A Productive timesheet is a separate day-level submission object and is intentionally excluded.
- The current account exposes a large eligible service catalog. The keyword query intentionally requests at most two records; zero results or a rejected unique result accept a different or more specific keyword, while multiple items or `next_offset` require a more specific keyword instead of pagination.
- This specification treats the user's existing web entry convention—filling `time` and `note` only—as authoritative for `billable_time` handling.
- The existing uncommitted Daily Timesheet documentation changes are preserved and must not be overwritten by the implementation.
- The approved deployment does not include a real Productive write, submission, approval, or any other Productive mutation.
