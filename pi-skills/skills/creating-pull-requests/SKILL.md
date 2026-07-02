---
name: creating-pull-requests
description: Use when creating a GitHub pull request after committing changes, especially in the jog-monorepo, to avoid messy descriptions, missing verification, or skipped review steps.
---

# Creating Pull Requests

## Overview

Create pull requests via the GitHub CLI after running the narrowest verification commands that prove the change works. Never paste raw terminal output into the PR body and never use an inline `--body` string with shell-sensitive characters.

## When to Use

- A human partner says "create PR" or "open a pull request"
- You have committed changes on a branch and need to request review
- You are at the end of a development branch and need to integrate work

## Before Creating the PR

1. **Load relevant skills first**
   - `verification-before-completion` if you are about to claim the work is done
   - `finishing-a-development-branch` if the implementation is complete and you need to decide merge, PR, or cleanup
   - `requesting-code-review` if you are asking for review or final checks
2. **Run verification** scoped to the touched area, then broader checks if the change crosses package boundaries. For the jog-monorepo this usually means:
   - `pnpm --filter <package> lint`
   - `pnpm --filter <package> typecheck`
   - `pnpm --filter <package> test`
   - Or the pre-push equivalent if requested: `pnpm typecheck`, `pnpm test:apps`, `pnpm test:services`, `pnpm test:packages`
3. **Ensure the branch is pushed** with an upstream set: `git push -u origin <branch>`
4. **Confirm the base branch** (usually `main` in this repo). If it is not `main`, note it in the PR description.

## Creating the PR

Use `gh pr create` and prefer a body file over an inline `--body` string.

```bash
# Write the body to a file first
gh pr create --base main --title "type(scope): description" --body-file /tmp/pr-body.md
rm -f /tmp/pr-body.md
```

**Title format** (conventional commits):

```text
type(scope): short imperative description
```

Use types `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`. Lowercase, imperative, no period.

## PR Body Template

```markdown
## Summary
- What changed and why
- Which packages/apps are affected
- Any breaking or risky changes

## Verification
- Exact commands run
- Results for each command
- Any skipped checks with reasons

## Other Notes
- Link to Linear ticket, or explain why there is none
- Screenshots or runtime evidence for UI/browser changes
- Environment, secrets, migration, deployment, or rollback impact
- Known follow-ups
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Inline `--body` with backticks, `>`, or `$` | Use `--body-file` to avoid shell expansion corrupting the description |
| Dumping raw terminal output into the PR body | Summarize results; only include relevant excerpts |
| Creating PR before running verification | Run targeted lint/typecheck/test first |
| PR title is not conventional commits | Rewrite as `type(scope): imperative description` |
| Missing Linear ticket or explanation | Always mention ticket number or state "No Linear ticket linked" |
| Forgetting to check base branch | Confirm with `git log --oneline origin/main..HEAD` or `gh pr view` after creation |

## Red Flags - STOP

- "I'll just paste the command output as the description"
- "No need to run tests, the pre-push hook will catch issues"
- "The PR body can be short, I'll fill it in later"
- `gh pr create --body "...` with shell-sensitive characters inside the body

## Project-Specific Notes (jog-monorepo)

- Prefer `gh` CLI over direct GitHub API calls for PR creation.
- Use `pnpm --filter <package>` to run the narrowest relevant checks first.
- Do not mix unrelated formatting, refactors, dependency updates, generated artifacts, or fixture files into the same PR.
- Ask before changing CI, branch protection, service-account permissions, deployment workflows, or secret-management behavior.
