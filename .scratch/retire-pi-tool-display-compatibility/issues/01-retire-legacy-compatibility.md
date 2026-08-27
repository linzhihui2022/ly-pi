# 01 — Retire legacy tool-display compatibility

**What to build:** ly-pi deploys and documents only the supported `my-tool-display` implementation. A deployment no longer creates or changes the retired third-party renderer configuration, while the current user's known inert local artifact is deliberately removed after successful validation and deployment.

**Blocked by:** None — can start immediately.

**Status:** resolved

**Risk:** High

**Approval:** User explicitly approved the complete retirement scope, one-time local cleanup, full deployment validation, and this single-ticket record in the associated Pi conversation.

- [x] The retired compatibility source, deployment transaction behavior, compatibility-only tests, and active migration documentation are removed together.
- [x] Deployment behavior is covered through the existing staging seam: it neither creates a missing legacy configuration nor modifies an existing one.
- [x] The resolved historical migration ticket remains unchanged.
- [x] Repository verification passes.
- [x] A normal deployment passes; the old package remains absent; the exact local legacy artifact is removed only after deployment, with its parent directory removed only if empty.
- [x] Runtime reload is requested after deployment.

## Decisions

- This repository no longer supports migration for users who still have the old third-party renderer installed.
- The one-time cleanup is not added as permanent automatic deletion behavior in the deployment workflow.

## Comments

- Approval (current Pi conversation): User authorized a single-file Biome formatting correction in `ly-pi/assets/config/mcp.json` after `bun run verify` identified pre-existing format drift. This exception is limited to restoring the verification baseline before the approved deployment validation.

## Answer

- Replaced the retired migration tests with staging-deployment tests proving a first deployment does not create the legacy config and an existing one remains unchanged.
- `bun run verify` passed: lint, both typechecks, 71 test files / 1215 tests, coverage thresholds, and documentation checks.
- `bun run deploy` passed. Before cleanup the old package was absent and the only old configuration artifact was the known 23-byte config file; after one-time cleanup, the config file, its empty parent directory, and the old package path are all absent.
- The resolved historical migration ticket was preserved. A runtime reload is requested after this deployment.
