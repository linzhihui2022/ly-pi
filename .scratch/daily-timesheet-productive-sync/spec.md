# daily-timesheet-productive-sync — 将 Daily Timesheet 写入 Productive

Status: ready-for-agent

Risk: High

Approval: 用户在本 Pi 会话确认本规格为后续拆票与实施范围，并明确授权将已验证的资源通过 `bun run deploy` 部署到 Pi；部署后仍须由用户执行 `/reload`。Productive 写入仍须在每次运行的预览后获得本次明确确认。

## Problem Statement

Daily Timesheet 目前从 GitHub PR 的提交推导按日、按 ticket 的工时分配，但只输出人工填报清单。维护者仍需在 Productive 中逐条录入，既增加重复劳动，也容易使分配结果与实际登记不一致。

Productive 中没有可用于 ticket 映射的 task。工时记录必须关联可记工时的 service；因此系统不能假定 GitHub ticket 能直接映射到 Productive task。

## Solution

保留既有的 Evidence Window、GitHub 提交筛选、Allocation Rule 和按日输出。完成工时分配后，Daily Timesheet 读取当前 Productive 用户可记工时的 service，基于当前 Git 仓库根目录名和 GitHub 仓库名推测最可能的 `deal > service`，并要求用户确认。

用户确认 service 后，技能先生成完整的 Productive 写入预览。获得本次明确确认才为每个“日期 + ticket”创建一条 draft time entry。每条记录保留 ticket 与摘要作为 note，不关联 Productive task，不创建或提交 timesheet，也不执行审批。技能只提供 `time` 与 `note`，让 Productive 保持网页录入时对 `billable_time` 的默认行为。

## User Stories

1. As a Daily Timesheet user, I want my GitHub-derived Allocation Rule results retained, so that Productive registration follows the same daily allocation I reviewed.
2. As a Daily Timesheet user, I want the skill to identify my current Productive identity, so that time is never recorded for another person.
3. As a Daily Timesheet user, I want the skill to inspect only services I can track time against, so that unavailable services are never proposed.
4. As a Daily Timesheet user, I want repository identity to suggest a `deal > service`, so that normal runs do not require me to search a large service catalog manually.
5. As a Daily Timesheet user, I want to confirm the suggested service before any write, so that a heuristic cannot misattribute my time.
6. As a Daily Timesheet user, I want to specify a service myself when the suggestion is absent or wrong, so that unconventional repository naming does not block registration.
7. As a Daily Timesheet user, I want each date and ticket allocation represented by its own time entry, so that the Productive note preserves the source allocation's traceability.
8. As a Daily Timesheet user, I want ticket and summary stored in the time-entry note rather than a Productive task, so that the workflow works in an organization without Productive tasks.
9. As a Daily Timesheet user, I want a complete create/skip/conflict preview before writing, so that I can inspect all financial-impacting changes as a batch.
10. As a Daily Timesheet user, I want newly created entries to remain draft and unsubmitted, so that I retain the existing Productive submission and approval workflow.
11. As a Daily Timesheet user, I want an existing generated entry left unchanged, so that rerunning the skill never overwrites a manually corrected record.
12. As a Daily Timesheet user, I want same-marker entries with a different time reported as conflicts, so that I can resolve discrepancies deliberately instead of receiving a duplicate or silent overwrite.
13. As a Daily Timesheet user, I want Productive locks, permission failures, and unavailable services reported clearly, so that I know which records still require manual action.
14. As a Daily Timesheet user, I want no-activity days and existing blind-spot reminders retained in the final result, so that Productive synchronization does not hide missing evidence or non-commit work.
15. As a Daily Timesheet user, I want the skill to state which entries were created, skipped, conflicted, or failed, so that the final output is an auditable registration receipt.

## Implementation Decisions

- The Daily Timesheet skill remains the single workflow seam. It keeps the current GitHub collection and Allocation Rule steps, then adds a Productive synchronization phase after the allocation is known.
- Productive connection remains a prerequisite. The synchronization phase resolves the current Productive person and uses that person for all reads and creates; GitHub author identity is not reused as a Productive identity.
- For each run, the skill paginates every service that the current person can track time against and whose time tracking is enabled. Candidate labels include both deal and service names so identical service names remain distinguishable.
- The service heuristic derives normalized candidates from the Git repository root basename and GitHub repository name. Normalization is case-insensitive and treats common path and word separators equivalently. Matching considers both deal and service names and ranks textual matches only to make a suggestion.
- A suggested service never authorizes a write. The user must explicitly confirm it. If there is no suitable suggestion or the user rejects it, the user supplies a `deal > service` choice; ambiguity remains a question rather than an automatic selection.
- The selected service applies to the current run only. This feature does not add a persistent repository-to-service mapping, a task mapping, or a configuration file.
- Each allocated date and ticket creates one draft Productive time entry with the current person, confirmed service, allocation date, minutes from the Allocation Rule, and a stable Daily Timesheet note containing the ticket-or-existing fallback label and summary.
- The synchronization intentionally omits a Productive task and `billable_time`. Omitting `billable_time` preserves the default behavior of the user's existing web-based time entry flow.
- The skill does not create a Productive timesheet. A timesheet is a day-level submission marker, so creating one would change the user's submission workflow and may make entries non-editable.
- Before the final confirmation, the skill queries the current person's existing time entries for the selected service and Evidence Window. An entry with the same stable Daily Timesheet note is not changed. If its minutes differ from the proposed allocation it is a conflict; if they match it is skipped. Other manual entries remain unrelated and unchanged.
- After the user explicitly confirms the preview, the skill bulk-creates only missing entries. It never updates, deletes, submits, approves, or unapproves Productive records.
- A Productive permission, date-lock, financial-lock, validation, or partial-write failure is reported with affected date and ticket labels. The skill does not retry by weakening safeguards or alter successfully existing entries.
- The final Daily Timesheet output retains its existing per-day summary and blind-spot reminders, then appends a concise synchronization receipt with created, skipped, conflicted, and failed entries.

## Testing Decisions

- Test the workflow at the Daily Timesheet skill seam through a worked example rather than internal Productive implementation details. The example must begin with synthetic GitHub allocations and synthetic paginated services, then show candidate suggestion, user confirmation, write preview, explicit final confirmation, and the resulting draft entries.
- The worked example must demonstrate that repository-derived matching is advisory: a wrong suggestion is rejected and a user-selected `deal > service` becomes the only target.
- The example must prove external behavior for one date with multiple tickets: each allocation becomes a separate entry, its minutes equal the Allocation Rule result, and its note preserves the ticket and summary.
- The example must prove that Productive task, `billable_time`, and timesheet submission are absent from generated entries and operations.
- The example must cover a matching existing marker (skip), a different-time matching marker (conflict), a missing entry (create), and an unavailable or ambiguous service (stop for user choice).
- Run the repository-wide verification command after the documentation changes. No new runtime code seam or external Productive write is needed to validate this skill-document update.

## Out of Scope

- Mapping individual tickets to Productive tasks or maintaining a persistent mapping table.
- Automatically selecting a service without user confirmation.
- Updating, deleting, submitting, approving, rejecting, unapproving, or otherwise mutating existing Productive entries.
- Changing the existing GitHub Evidence Window, commit filtering, Allocation Rule, ticket extraction fallback, or no-activity output.
- Creating Productive tasks, services, deals, or timesheets.
- Performing a real Productive write. The approved deployment is limited to copying the verified repository assets to Pi and requesting a user-run `/reload`.

## Further Notes

- Productive time entries require a person, service, date, and time. A Productive timesheet is a separate day-level submission object and is intentionally excluded.
- The current account exposes a large eligible service catalog, so exhaustive pagination is part of the requested selection behavior rather than an implicit assumption that the first page is complete.
- This specification treats the user's existing web entry convention—filling `time` and `note` only—as authoritative for `billable_time` handling.
- The existing uncommitted Daily Timesheet documentation changes are preserved and must not be overwritten by the implementation.
- The approved deployment does not include a real Productive write, submission, approval, or any other Productive mutation.
