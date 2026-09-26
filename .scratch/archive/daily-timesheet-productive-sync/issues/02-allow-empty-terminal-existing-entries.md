# 02 — Allow empty terminal existing-entry responses

**What to fix:** A successful `time_entries` duplicate-preflight query can return `items: []` with no `next_offset` and no `query_id`. The Daily Timesheet skill currently treats the missing `query_id` as a batch-blocking failure even though the response is a complete empty result and there are no existing notes to compare.

**Blocked by:** None

**Status:** resolved

**Risk:** High

**Approval:** The user explicitly approved this source-document correction in the current Pi session. The scope is limited to the Daily Timesheet source skill, its specification, and this ticket; it does not authorize deployment, Productive writes, or any mutation of external records.

- [x] Treat a successful initial `time_entries` response with `items: []` and no `next_offset` as a complete empty result even when `query_id` is missing or empty, and classify its candidates as `Create`.
- [x] Keep missing/empty `query_id` blocking for non-empty initial pages, initial pages with `next_offset`, booking lookup, and service revalidation.
- [x] Keep malformed responses, query failures, invalid pagination, and incomplete existing-entry data blocked.
- [x] Update the worked examples to cover the valid empty terminal response and the blocking neighboring cases.
- [x] Run `bun run verify` successfully.
- [x] Do not deploy or call any Productive mutation.

## Answer

Updated `ly-pi/assets/skills/daily-timesheet/SKILL.md` and the parent specification. A successful empty terminal `time_entries` response (`items: []`, no `next_offset`) is now a complete empty result even without `query_id`, so candidates continue as `Create`. Non-empty pages, pages with `next_offset`, booking lookup, service revalidation, malformed data, pagination failures, and query failures remain blocked. Added the boundary case to the worked example. `bun run verify` passed; no deployment or Productive mutation was performed.
