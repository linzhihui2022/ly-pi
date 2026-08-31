# 01 — Sync Daily Timesheet to Productive draft entries

**What to build:** Refine Daily Timesheet so the user selects a Productive service through a unique keyword match, then receives draft entries whose notes are only ticket plus an LLM summary of PR title and commit headlines. Existing same-day, same-service notes are semantically compared by LLM; uncertainty is presented for user review before any write.

**Blocked by:** None — can start immediately.

**Status:** resolved

**Risk:** High

**Approval:** Approved in the parent specification. The user also explicitly approved a user-keyword unique-match query and `<ticket> <LLM summary>` notes with LLM semantic matching plus Review on uncertainty; these refinements do not authorize deployment. The previously deployed assets remain an earlier completed action. Each Productive write remains gated by an explicit confirmation during that Daily Timesheet run.

- [x] Preserve the existing Evidence Window, GitHub collection, Allocation Rule, ticket fallback, no-activity output, and blind-spot reminders.
- [x] Resolve the current Productive person, request one nonempty service keyword, and query only that person's time-trackable services with a two-record limit. A failed or malformed query stops without writes. Zero results or a rejected unique result require a different or more specific keyword; multiple returned items or `next_offset` require a more specific keyword. Accept only one item with no `next_offset` as `deal > service`, without pagination.
- [x] Produce a pre-write receipt that classifies every proposed date-and-ticket entry as create, skip, conflict, or review through same-day, same-service LLM content matching. Treat ticket/label as a weak signal, reserve each existing entry for at most one automatic candidate match, and route competing matches to review. A failed or malformed LLM result blocks the entire pre-write with a reported `Blocked` reason and no final confirmation; leave all existing Productive records unchanged.
- [x] After explicit final confirmation, create only missing draft time entries with the confirmed service, allocated minutes, and a note formatted as `<ticket-or-fallback-label> <LLM summary>`; do not link a task, set `billable_time`, create a timesheet, submit, approve, update, or delete records.
- [x] Report created, skipped, conflicted, reviewed, blocked, and failed entries alongside the normal Daily Timesheet result, including clear handling for unavailable services, malformed preflight data, permissions, locks, and unresolved Review items.
- [x] Add a worked example that proves zero, ambiguous, unique, and rejected keyword outcomes; LLM summary content; create/skip/conflict/review behavior including Review `Create`, `Skip`, and `Cancel`; one-to-one duplicate matching; and the absence of task, explicit billable-time, and submission operations.
- [x] Run the repository-wide verification command successfully.
- [x] Deploy the verified assets with `bun run deploy` and request the user to run `/reload` after a successful deployment.

## Answer

Replaced full service pagination with unique keyword lookup, and replaced marker notes with `<ticket> <LLM summary>` notes plus one-to-one same-day semantic duplicate review. Query and LLM failures now block the pre-write rather than reaching confirmation. `bun run verify` passed. This source-only refinement does not authorize another deployment or any real Productive write.

## Comments

- The user explicitly authorized `gh auth switch --hostname github.com --user linzhihui2022` solely to create the already-pushed feature-branch PR. This does not authorize credential creation, force-push, or unrelated GitHub mutations.
- The user subsequently approved weak-ticket one-to-one matching, batch-blocking for LLM failures, `items`/`next_offset` uniqueness checks, state-specific keyword retry wording, and the revised worked example. These decisions do not authorize deployment or real Productive writes.
