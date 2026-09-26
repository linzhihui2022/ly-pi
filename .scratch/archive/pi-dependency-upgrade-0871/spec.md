# Upgrade Pi project dependencies to 0.87.1

Status: resolved

## Problem Statement

The repository's Pi runtime libraries were pinned at 0.85.1 while Pi 0.86/0.87 shipped extension API changes. Staying behind drifts from the API surface the extensions are written against and blocks adopting newer Pi features.

## Solution

Upgrade the three direct Pi dependencies to `^0.87.1`, refresh the lockfile, and validate the repository end to end.

## Implementation Decisions

- `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` in `ly-pi/package.json` move to `^0.87.1`.
- `bun.lock` is refreshed with `bun install --filter ly-pi --lockfile-only --registry https://registry.npmmirror.com`, which also pulls the required transitive dependencies of the Pi family.

## Testing Decisions

- `bun run verify` passes: lint, both typechecks, 76 test files / 1,268 tests, and all check-docs checks.

## Out of Scope

- No unrelated dependency changes.
- No source changes beyond what the upgrade requires.

## Further Notes

This spec was backfilled in 2026-09 from the completed ticket; the feature did not have a spec up front.
