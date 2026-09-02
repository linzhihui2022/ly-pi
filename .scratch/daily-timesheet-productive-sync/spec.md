# daily-timesheet-productive-sync — 将 Daily Timesheet 写入 Productive

Status: ready-for-agent

Risk: High

Approval: 用户在本 Pi 会话确认本规格为后续拆票与实施范围，并明确授权将已验证的资源通过 `bun run deploy` 部署到 Pi；部署后仍须由用户执行 `/reload`。用户随后明确批准将 service 全量分页改为用户关键词的唯一匹配查询，并将 note 改为 `<ticket> <LLM 总结>`；同日同 service 的既有 note 由 LLM 语义识别，不确定项须进入 Review 由用户决定。此次 refinements 不含部署。用户随后明确批准仅修改源技能与规格，使 service 输入可为包含内部空格的非空短语；随后明确授权通过 `bun run deploy` 部署本次已验证的资源。部署后仍须由用户执行 `/reload`；该部署不授权任何 Productive 写入。用户又明确批准仅移除禁止展示候选或手选的规则文字；此变更不要求或定义候选选择行为，随后明确授权通过 `bun run deploy` 部署本次已验证的资源。部署后仍须由用户执行 `/reload`；该部署不授权任何 Productive 写入。用户又明确批准将 service 定位改为历史工时优先：读取当前人最近 50 条条目，按 Service ID 去重展示至多 10 个候选及最近使用日期；用户选择后重新确认该 Service 当前可记工时，历史为空、候选被拒绝或已不可用时回退关键词或短语查询。此次只改源技能与规格，随后明确授权通过 `bun run deploy` 部署本次已验证的资源。部署后仍须由用户执行 `/reload`；该部署不授权任何 Productive 写入。用户又明确批准按日期使用 Scheduled on：每个有分配工时的日期读取当前人的有效 Service booking，多条由用户手选；零条、取消选择或所选 service 不可用时跳过该日期并汇报，不回退到历史工时或关键词搜索；查询或数据异常阻断整批同步。此次只改源技能与规格，不授权部署或任何 Productive 写入。用户随后明确授权将已验证的 Scheduled on 变更创建本地 Git commit（不 push）并通过 `bun run deploy` 部署；该部署仍不授权任何 Productive 写入。Productive 写入仍须在每次运行的预览后获得本次明确确认。

## Problem Statement

Daily Timesheet 目前从 GitHub PR 的提交推导按日、按 ticket 的工时分配，但只输出人工填报清单。维护者仍需在 Productive 中逐条录入，既增加重复劳动，也容易使分配结果与实际登记不一致。

Productive 中没有可用于 ticket 映射的 task。工时记录必须关联可记工时的 service；因此系统不能假定 GitHub ticket 能直接映射到 Productive task。

## Solution

保留既有的 Evidence Window、GitHub 提交筛选、Allocation Rule 和按日输出。完成工时分配后，Daily Timesheet 对每个有分配工时的日期完整读取当前 Productive 用户有效的 Service booking（Scheduled on）分页后再形成候选。当前账号不能读取 Deal，因此候选、预览和回执只显示 service 名、关联 task（如有）与排期信息，不显示 Deal 名或内部 ID。当天只有一个有效 service 时仍须由用户确认；有多个时由用户手选；零个、取消选择、不可记工时或无法区分的候选只跳过该日期并汇报。booking 或重验查询、后续页或数据失败会阻断整批同步。流程绝不回退到历史 time entry 或关键词/短语搜索。

每个未跳过日期的 service 都经当前可记工时重验后，技能先生成完整的 Productive 写入预览。获得本次明确确认才为每个“日期 + ticket”创建一条 draft time entry，并使用该日期的 service。每条 note 仅为 `<ticket-or-label> <content>`，其中 content 由 LLM 基于 PR 标题和去重后的命中 commit headlines 生成一条忠实、保留源语言的总结；不关联 Productive task，不创建或提交 timesheet，也不执行审批。技能只提供 `time` 与 `note`，让 Productive 保持网页录入时对 `billable_time` 的默认行为。

## User Stories

1. As a Daily Timesheet user, I want my GitHub-derived Allocation Rule results retained, so that Productive registration follows the same daily allocation I reviewed.
2. As a Daily Timesheet user, I want the skill to identify my current Productive identity, so that time is never recorded for another person.
3. As a Daily Timesheet user, I want the skill to inspect my active Scheduled on service bookings for each allocated date and revalidate the selected service, so that unavailable services are never proposed.
4. As a Daily Timesheet user, I want to explicitly choose among multiple Scheduled on services for a date, so that no booking is selected by guesswork.
5. As a Daily Timesheet user, I want a date with no booking, a cancelled choice, an unavailable service, or indistinguishable choices skipped and reported, so that other dates can continue without a guessed service.
6. As a Daily Timesheet user, I want no fallback to historical entries or keyword search, so that every proposed service comes from that date's Scheduled on data.
7. As a Daily Timesheet user, I want each non-skipped date and ticket allocation represented by its own time entry using that date's service, so that the Productive note preserves the source allocation's traceability.
8. As a Daily Timesheet user, I want each note formatted as ticket plus an LLM summary of the PR title and commit headlines, so that it is informative without exposing an implementation marker.
9. As a Daily Timesheet user, I want a complete create/skip/conflict/review preview before writing, so that I can inspect all financial-impacting changes as a batch.
10. As a Daily Timesheet user, I want newly created entries to remain draft and unsubmitted, so that I retain the existing Productive submission and approval workflow.
11. As a Daily Timesheet user, I want an existing generated entry left unchanged, so that rerunning the skill never overwrites a manually corrected record.
12. As a Daily Timesheet user, I want one-to-one LLM semantic matching of same-day, same-service notes, a Review state for uncertainty or competing matches, and a blocked pre-write for technical LLM failures, so that ambiguous content never causes a silent duplicate or omission.
13. As a Daily Timesheet user, I want Productive locks, permission failures, and unavailable services reported clearly, so that I know which records still require manual action.
14. As a Daily Timesheet user, I want no-activity days and existing blind-spot reminders retained in the final result, so that Productive synchronization does not hide missing evidence or non-commit work.
15. As a Daily Timesheet user, I want the skill to state which dates were not scheduled and which entries were created, skipped, conflicted, reviewed, blocked, or failed, so that the final output is an auditable registration receipt.

## Implementation Decisions

- The Daily Timesheet skill remains the single workflow seam. It keeps the current GitHub collection and Allocation Rule steps, then adds a Productive synchronization phase after the allocation is known.
- Productive connection remains a prerequisite. The synchronization phase resolves the current Productive person and uses that person for all reads and creates; GitHub author identity is not reused as a Productive identity.
- For every date with an allocation, the skill queries `bookings` for the current person with `booking_type=service`, `is_canceled=false`, `with_draft=true`, and `after`/`before` covering that date. The initial page requests at most 200 bookings with the booking schedule, service name, and optional task title; date-spanning bookings are included.
- The skill consumes every booking page before deduplication or selection. Whenever a page returns `next_offset`, it continues only with the initial query's `query_id` until no `next_offset` remains; a missing `query_id`, repeated or non-advancing offset, continuation failure, missing/non-array `items`, or malformed booking/service data is a batch-blocking `Blocked` result, never an empty Scheduled on result.
- The skill deduplicates same-day bookings by service ID. It displays each service name, optional task, and a booking-method-appropriate schedule summary without IDs or Deal names. One candidate requires confirmation; multiple candidates require an explicit selection. User-visible collisions across different service IDs are not selectable.
- No valid booking, a cancelled selection, an unavailable selected service, or an unselectable collision marks only that date `Not scheduled`; it creates no candidate or time entry for the date and continues with the others.
- Every confirmed selection is revalidated by querying services with the current person, time tracking enabled, and the exact service name, with up to 200 records per page. Using the returned `query_id` and `next_offset`, the skill follows only this exact-name query until it finds the original booking service ID or exhausts results. A same-named different ID is never substituted. Query failure or malformed data blocks the batch; a valid response without the original eligible ID skips the date as unavailable.
- The per-date selected service applies to the current run only. This feature does not add a persistent repository-to-service mapping, a task mapping, a history lookup, or a keyword/phrase search.
- Each non-skipped allocated date and ticket creates one draft Productive time entry with the current person, that date's confirmed service, allocation date, and minutes from the Allocation Rule. Its note is only `<ticket-or-label> <content>`, where an LLM produces one faithful, source-language summary from the PR title and de-duplicated matching commit headlines.
- A generated summary must be nonempty, one line, and free of dates, markers, hidden prefixes, or unsupported content. Any failed, unavailable, or malformed summary generation marks the pre-write `Blocked`.
- The synchronization intentionally omits a Productive task and `billable_time`. Omitting `billable_time` preserves the default behavior of the user's existing web-based time entry flow.
- The skill does not create a Productive timesheet. A timesheet is a day-level submission marker, so creating one would change the user's submission workflow and may make entries non-editable.
- Before final confirmation, the skill queries existing time entries for the current person, that candidate's per-date selected service, and same calendar day. Every page must be read; a query or pagination failure, missing/non-array `items`, or incomplete existing-entry data is a batch-blocking `Blocked`, never an empty result. An LLM compares every candidate note with those notes as `Same`/`Different`/`Uncertain`. The ticket-or-label is a weak identity signal: a matching label supports `Same`, while a mismatched or missing label does not alone rule it out.
- A successful comparison returns exactly one category and a nonempty reason. `Uncertain` is a valid reviewable result; a timeout, unavailable LLM, empty or malformed response, multiple categories, or invalid summary marks the pre-write `Blocked`.
- Any `Blocked` result prevents final confirmation and every create in the current run. An existing entry can be automatically associated with at most one candidate. Any `Uncertain`, multiple `Same` results for one candidate, or an existing entry reported `Same` for multiple candidates puts every affected candidate into Review; Review takes precedence over automatic classification.
- Only a candidate outside Review with exactly one unclaimed `Same` and every other comparison `Different` is Skip when minutes match or Conflict when they differ. A candidate outside Review with no existing entry or only `Different` comparisons is Create. Other manual entries remain unchanged.
- After the user explicitly confirms the preview, the skill bulk-creates only missing entries. It never updates, deletes, submits, approves, or unapproves Productive records.
- A Productive permission, date-lock, financial-lock, validation, or partial-write failure is reported with affected date and ticket labels. The skill does not retry by weakening safeguards or alter successfully existing entries.
- The final Daily Timesheet output retains its existing per-day summary and blind-spot reminders, then appends a concise synchronization receipt with selected Scheduled on services, `Not scheduled` dates, created, skipped, conflicted, reviewed, blocked, and failed entries.

## Testing Decisions

- Test the workflow at the Daily Timesheet skill seam through a worked example rather than internal Productive implementation details. The example must begin with synthetic GitHub allocations and per-date Scheduled on bookings, show a later booking page changing the candidate set before selection, then show single-candidate confirmation, multiple-candidate choice, ID-preserving eligibility revalidation, preview, explicit final confirmation, and resulting draft entries.
- The worked example must demonstrate that zero bookings, cancelled choices, unavailable selected services, and indistinguishable same-label services skip only their date; booking or revalidation query/data failure, continuation failure, malformed page, or invalid pagination metadata blocks the batch. It must prove there is no historical-entry or keyword/phrase fallback. Booking lookup and exact-name revalidation both consume all pages; only exact-name revalidation may paginate to locate the original booking service ID, and no broad service catalog is paginated.
- The example must prove external behavior for one date with multiple tickets: each allocation becomes a separate entry, their minutes sum to the configured daily total, and each note contains only ticket plus an LLM summary of its PR title and commit headlines.
- The example must prove that Productive task, `billable_time`, and timesheet submission are absent from generated entries and operations.
- The example must compare every candidate with every same-day, same-service existing note, show that a missing or different ticket can still be `Same`, and show that a candidate with both `Same` and `Uncertain` is Review. It must also cover semantic same-content (skip), semantic same-content with different minutes (conflict), different content (create), competing content (Review), and unavailable or ambiguous Scheduled on services (date skip). It must show Review `Create`, `Skip`, and `Cancel`; cancellation means no final confirmation or create.
- Validation must concretely prove that an LLM timeout, unavailability, malformed response, invalid summary, missing comparison reason, Scheduled on query/data failure, or existing-time-entry query/pagination/data failure is `Blocked`, prints a blocked receipt, prevents final confirmation, and makes no create call.
- Run the repository-wide verification command after the documentation changes. No new runtime code seam or external Productive write is needed to validate this skill-document update.

## Out of Scope

- Mapping individual tickets to Productive tasks or maintaining a persistent mapping table.
- Querying or presenting Deal names or internal IDs; the current account lacks Deal read permission.
- Automatically selecting a service without user confirmation.
- Updating, deleting, submitting, approving, rejecting, unapproving, or otherwise mutating existing Productive entries.
- Changing the existing GitHub Evidence Window, commit filtering, Allocation Rule, ticket extraction fallback, or no-activity output.
- Creating Productive tasks, services, deals, or timesheets.
- Performing a real Productive write. The approved deployment was limited to copying the then-verified repository assets to Pi and requesting a user-run `/reload`.
- Falling back from Scheduled on to historical time entries, a service catalog, or keyword/phrase search.
- Deploying this Scheduled on refinement; any new deployment requires separately recorded approval.

## Further Notes

- Productive time entries require a person, service, date, and time. A Productive timesheet is a separate day-level submission object and is intentionally excluded.
- The current account can query its own work bookings. Scheduled on is sourced from active service bookings covering each allocation date; service identity is retained only for exact-name current-eligibility revalidation, never displayed. Booking lookup failures block rather than falling back.
- This specification treats the user's existing web entry convention—filling `time` and `note` only—as authoritative for `billable_time` handling.
- The existing uncommitted Daily Timesheet documentation changes are preserved and must not be overwritten by the implementation.
- The approved deployment does not include a real Productive write, submission, approval, or any other Productive mutation.
