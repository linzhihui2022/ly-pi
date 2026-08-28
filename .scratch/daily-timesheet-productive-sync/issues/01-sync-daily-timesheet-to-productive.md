# 01 — Sync Daily Timesheet to Productive draft entries

**What to build:** Extend Daily Timesheet from a GitHub-derived allocation receipt into a complete, confirmation-gated Productive synchronization workflow. It must discover a service the current Productive user can track time against, suggest a repository-based match for the user to confirm or replace, preview duplicate-safe draft entries, and create only the missing entries after final confirmation.

**Blocked by:** None — can start immediately.

**Status:** resolved

**Risk:** High

**Approval:** Approved in the parent specification. The user also explicitly approved deployment of the verified assets through `bun run deploy`; the post-deploy runtime reload remains a user action. Each Productive write remains gated by an explicit confirmation during that Daily Timesheet run.

- [x] Preserve the existing Evidence Window, GitHub collection, Allocation Rule, ticket fallback, no-activity output, and blind-spot reminders.
- [x] Resolve the current Productive person and fully paginate only services that person can track time against; derive and present a `deal > service` suggestion from the repository root and GitHub repository name, but require user confirmation or a user-selected fallback.
- [x] Produce a pre-write receipt that classifies every proposed date-and-ticket entry as create, skip, or conflict; leave all existing Productive records unchanged.
- [x] After explicit final confirmation, create only missing draft time entries with the confirmed service, allocated minutes, and a stable note carrying ticket-or-fallback label plus summary; do not link a task, set `billable_time`, create a timesheet, submit, approve, update, or delete records.
- [x] Report created, skipped, conflicted, and failed entries alongside the normal Daily Timesheet result, including clear handling for unavailable services, permissions, and locks.
- [x] Add a worked example that proves service suggestion and rejection, manual fallback, create/skip/conflict behavior, and the absence of task, explicit billable-time, and submission operations.
- [x] Run the repository-wide verification command successfully.
- [x] Deploy the verified assets with `bun run deploy` and request the user to run `/reload` after a successful deployment.

## Answer

Expanded Daily Timesheet with confirmation-gated Productive draft-entry synchronization, duplicate-safe previewing, and a worked example. `bun run verify` and `bun run deploy` passed; the deployed Daily Timesheet snapshot was verified. No real Productive write was performed.
