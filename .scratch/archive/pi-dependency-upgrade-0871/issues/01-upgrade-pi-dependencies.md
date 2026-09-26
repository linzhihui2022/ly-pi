# 01 — Upgrade Pi project dependencies to 0.87.1

**What to build:** Upgrade the project's Pi runtime libraries from 0.85.1 to 0.87.1 and validate the repository.

**Status:** resolved

**Risk:** Medium — Pi 0.86/0.87 include extension API changes and affect the repository's Pi integration.

**Approval:** The user explicitly requested upgrading project dependencies to 0.87.1 and selected recording that request here as the approval basis for this ticket's scope.

## Scope

- Upgrade `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` in `ly-pi/package.json` to `^0.87.1`.
- Update `bun.lock` to resolve the Pi package family to 0.87.1.
- Make no unrelated dependency or source changes.

## Acceptance

- [x] The three direct Pi dependencies declare `^0.87.1`.
- [x] `bun.lock` resolves the Pi package family to 0.87.1.
- [x] `bun run verify` passes.

## Comments

- `bun install --filter ly-pi --lockfile-only --registry https://registry.npmmirror.com` updated the Pi package family and its required transitive dependencies.
- `bun run verify` passed: lint, both typechecks, 76 test files / 1,268 tests, and all check-docs checks.
