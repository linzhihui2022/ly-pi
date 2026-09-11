# 06 — Remediate PR #20 safety review

Type: task
Status: resolved
Risk: High
Approval: The user explicitly approved remediation of every PR #20 review finding in this Pi session on 2026-09-11.

## Scope

Repair the `image_asset` authorization, privacy, Codex provenance, staging, rollback, retry, and batch-publication findings from PR #20. Keep the existing public tool contract and do not deploy or invoke real Codex generation.

## Acceptance criteria

- Direct authorization rejects negated image requests, prefix/suffix path lookalikes, and implicit overwrite requests.
- The final Codex prompt is derived from the user-authorized request or an exact confirmed proposal.
- A successful Codex run includes verifiable built-in `image_gen` evidence.
- Retry cannot publish a stale staged artifact; publication rejects path/staged-file substitution and preserves recoverable backups on rollback failure.
- Interrupted multi-output publication can be recovered before a later batch runs.
- Documentation module count is correct, focused tests pass, and `bun run verify` passes.

## Result

- Hardened direct authorization and bound direct prompts to the final user request.
- Required completed built-in `image_gen` JSONL evidence and byte-level artifact matching before accepting Codex success.
- Added runtime validation for resolved requests, regular-file source checks, canonical workspace paths, isolated retry staging, no-clobber publication, versioned recovery journals, and recoverable rollback handling.
- Serialized automatic candidate selection, preserved cleanup failures, and exposed one-to-one per-output publication statuses.
- Corrected the README module count and synchronized the image operation result documentation.

Verification: `bun run verify` passed (74 test files, 1,253 tests; coverage thresholds met; check-docs passed).
