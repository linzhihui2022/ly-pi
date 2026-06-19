# Skill Migration Tracker: Superpowers → Pi

Tracks the migration status of every skill in the Superpowers ecosystem.

**Core Rule:** Every Superpowers skill is migrated **as-is** — original name, original workflow, original logic. We do NOT map them to existing Pi equivalents. If both ecosystems have a "planning" skill, both exist side by side.

---

## Legend

| Status | Meaning |
|---|---|
| ✅ Migrated | Ported to `pi-skills/`. Ready to use. |
| ⏳ Pending | Not yet migrated. Waiting for port. |
| 🚫 Skip | Platform-specific to Superpowers; do not migrate. |

---

## Migration Table

| # | Superpowers Skill | Status | Notes |
|---|-------------------|--------|-------|
| 1 | `brainstorming` | ✅ Migrated | Paths updated to `.lychee/`. `plan` skill name kept as `writing-plans` in source. |
| 2 | `writing-plans` | ✅ Migrated | Paths updated to `.lychee/artifacts/plans/`; removed `superpowers:` prefix; neutralized branding. |
| 3 | `executing-plans` | ✅ Migrated | Removed `superpowers:` prefixes; replaced `TodoWrite` with `todo`; neutralized branding. |
| 4 | `verification-before-completion` | ✅ Migrated | Pure documentation skill; no platform-specific content. Deployed via `./install.sh`. |
| 5 | `requesting-code-review` | ✅ Migrated | Replaced `Task tool` with two-step `subagent()` (scout gather diff then reviewer review); updated plan path to `.lychee/artifacts/plans/`. |
| 6 | `receiving-code-review` | ✅ Migrated | Migrated as-is. Replaced `CLAUDE.md` with `AGENTS.md`. |
| 7 | `dispatching-parallel-agents` | ✅ Migrated | Replaced `Task()` syntax with `subagent({ subagent_type: "worker", ..., run_in_background: true })` using multiple independent calls. No platform-specific content. |
| 8 | `subagent-driven-development` | ✅ Migrated | Replaced `TodoWrite` with `todo`, `Task tool` with `subagent({ subagent_type: "worker"|"reviewer", ... })` calling convention, updated prompt templates, removed `using-git-worktrees` reference, updated paths to `.lychee/artifacts/`. |
| 9 | `using-git-worktrees` | 🚫 Skip | Pi does not support git worktrees. Remove all references. |
| 10 | `systematic-debugging` | 🚫 Skip | Pi already has equivalent debugging capabilities built-in. |
| 11 | `test-driven-development` | ✅ Migrated | Pure documentation skill; no platform-specific content. Migrated as-is with no changes. |
| 12 | `finishing-a-development-branch` | ✅ Migrated | **Heavy customization** — diverged significantly from upstream: removed "Merge Locally" option; restructured to 5 options with batch-commit focus; Option 5 changed from "Discard branch" to "Rollback uncommitted changes" (`git checkout -- .` + `git clean -fd`, branch preserved); all options renamed to English; Quick Reference and Common Mistakes updated accordingly. |
| 13 | `writing-skills` | ✅ Migrated | Replaced `superpowers:` prefix; updated `CLAUDE.md` references to Pi equivalents (`AGENTS.md`, `.rpiv/guidance/`); updated personal skill paths; neutralized branding; renamed `examples/CLAUDE_MD_TESTING.md` to `AGENTS_MD_TESTING.md`. |
| 14 | `using-superpowers` | ✅ Migrated (no SHA) | Migrated as Pi-native meta skill. Removed platform-specific references. Kept only `references/pi-tools.md`. |

---

## Cross-Skill References

When a skill references another skill, keep the **original name**. Only update paths.

### Example: `brainstorming` references `writing-plans`

```
# In brainstorming/SKILL.md — BEFORE migration
The terminal state is invoking writing-plans.

# In brainstorming/SKILL.md — AFTER migration
The terminal state is invoking writing-plans.
# ^^^ Name stays the SAME. Only paths change:
# docs/superpowers/specs/... → .lychee/artifacts/designs/...
```

### Example: `executing-plans` references `verification-before-completion`

```
# In executing-plans/SKILL.md — BEFORE
After each phase, run verification-before-completion.

# In executing-plans/SKILL.md — AFTER
After each phase, run verification-before-completion.
# ^^^ Name stays the SAME.
```

---

## What NOT to Do

❌ **Do NOT rename skills to match Pi equivalents:**

- `writing-plans` → ~~`plan`~~
- `executing-plans` → ~~`implement`~~
- `verification-before-completion` → ~~`validate`~~
- `requesting-code-review` → ~~`code-review`~~

❌ **Do NOT remove skill references because Pi has something similar:**

- Keep `writing-plans` references in `brainstorming`
- Keep `executing-plans` references in `writing-plans`
- Keep cross-skill call chains intact

✅ **Do update only these things:**

- File paths (`.superpowers/` → `.lychee/`, `docs/superpowers/` → `.lychee/artifacts/`)
- Platform-specific logic (CODEX_CI, MSYSTEM, etc.)
- Tool casing (`Bash` → `bash`, `Write` → `write`)
- Background params (`async` → `run_in_background`)
- Branding (`Superpowers` → neutral, `Claude Code` → `Pi`)
- Pi-native tool integration (`ask_user_question`, `todo`, `subagent` with `subagent_type`)

---

## Updating This Tracker

When you complete a migration:

1. Change the skill's status from ⏳ to ✅
2. Add migration notes (what was tricky, what needed manual work)
3. Update `brainstorming` or other skills that reference it if their docs need path changes
4. Run `./install.sh` to deploy the updated `migrate-superpower` skill

---

## Other Migrated Skills

The migration standards in this tracker are also applied to high-quality skills from other ecosystems (e.g., Matt Pocock's skills, Codex/Claude Code community skills). These are not from the Superpowers upstream, so they are tracked separately here.

| # | Skill | Source | Status | Notes |
|---|-------|--------|--------|-------|
| 1 | `grill-me` | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me) | ✅ Migrated | Adapted to Pi: added hard gate, `todo` tracking, `ask_user_question` guidance, codebase-first exploration, and handoff to `writing-plans`/`executing-plans`. Kept original name and core interviewing loop. |

---

## Current Blockers

None. Skills can be migrated in any order. However, if Skill A's workflow invokes Skill B, consider migrating B first so A's references are valid.

Suggested order based on dependency chains:

1. `writing-plans` (referenced by `brainstorming`)
2. `executing-plans` (references `writing-plans`, `verification-before-completion`)
3. `verification-before-completion`
4. Others in any order
