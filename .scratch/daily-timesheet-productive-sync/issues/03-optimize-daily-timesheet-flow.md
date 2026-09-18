# 03 — Shorten the Daily Timesheet Productive flow

**What to optimize:** Preserve every Productive safety gate while removing avoidable waits and no-op branches from the Daily Timesheet workflow. The optimization must keep Scheduled on as the only service source, retain exact service-ID revalidation, keep the existing-entry semantic preflight, and require final confirmation before any draft create.

**Blocked by:** None

**Status:** resolved

**Risk:** High

**Approval:** The user explicitly approved this source-document optimization in the current Pi session. The approved scope keeps booking lookup, service revalidation, existing-entry duplicate preflight, Review handling, final preview, and explicit write confirmation. It adds no-allocation and all-`Not scheduled` short-circuits, bounded parallel read-only work, one combined service-selection interaction, per-run distinct-service revalidation, per-service date-window existing-entry queries partitioned by exact date, and one combined Review interaction. It does not add a force-create mode, skip duplicate checks, deploy, or perform any Productive mutation.

- [x] Keep the Productive connection status check; after allocation, skip the remaining Productive phase when there are no allocated dates.
- [x] If every allocated date becomes `Not scheduled`, skip summary generation, existing-entry preflight, final confirmation, and all creates while retaining the normal report and receipt.
- [x] Allow independent GitHub and Productive read-only calls to run with bounded parallelism without changing pagination, filtering, ordering, or blocking behavior.
- [x] Fetch all allocated-date bookings before presenting one combined service-confirmation interaction; keep confirmation/selection independent per date.
- [x] Revalidate each distinct confirmed service ID once per run, bind the result to all matching dates, and keep exact-ID matching and all blockers unchanged.
- [x] Query existing `time_entries` once per distinct selected service over its earliest-to-latest allocated date window, paginate completely, partition by exact date, and compare only same-date/same-service records. Preserve the empty terminal response exception and every other blocker.
- [x] Allow summary generation and existing-entry window reads to run in parallel; wait for both before comparison and block on either failure.
- [x] Present all unresolved Review decisions in one interaction while keeping per-candidate `Create`/`Skip`/`Cancel` choices and cancellation semantics.
- [x] Ask for final write confirmation only when the final `Create` list is non-empty; preserve the preview and all write restrictions.
- [x] Update the worked example and specification with the optimization behavior and boundary cases.
- [x] Run `bun run verify` successfully.
- [x] Do not deploy or call any Productive mutation.

## Answer

Updated `ly-pi/assets/skills/daily-timesheet/SKILL.md` and the parent specification. The flow now short-circuits after no allocation or all `Not scheduled` dates, runs independent read-only work in bounded parallelism, combines service and Review interactions, revalidates repeated service IDs once per run, and queries existing entries by distinct-service date windows before exact-date partitioning. The empty terminal `time_entries` exception and all blocking safeguards remain unchanged. `bun run verify` passed: 76 test files and 1268 tests. No deployment or Productive mutation was performed.
