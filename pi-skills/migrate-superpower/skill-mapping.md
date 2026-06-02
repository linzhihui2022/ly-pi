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
| 1 | `brainstorming` | ✅ Migrated | Paths updated to `.lychee/`. `plan` skill name kept as `writing-plans` in source (pending #2). |
| 2 | `writing-plans` | ⏳ Pending | Migrate as `pi-skills/writing-plans/`. Keep name. Do NOT rename to `plan`. |
| 3 | `executing-plans` | ⏳ Pending | Migrate as `pi-skills/executing-plans/`. Keep name. Do NOT rename to `implement`. |
| 4 | `verification-before-completion` | ⏳ Pending | Migrate as `pi-skills/verification-before-completion/`. |
| 5 | `requesting-code-review` | ⏳ Pending | Migrate as `pi-skills/requesting-code-review/`. |
| 6 | `receiving-code-review` | ⏳ Pending | Migrate as `pi-skills/receiving-code-review/`. |
| 7 | `dispatching-parallel-agents` | ⏳ Pending | Migrate as `pi-skills/dispatching-parallel-agents/`. |
| 8 | `subagent-driven-development` | ⏳ Pending | Migrate as `pi-skills/subagent-driven-development/`. |
| 9 | `using-git-worktrees` | 🚫 Skip | Pi does not support git worktrees. Remove all references. |
| 10 | `systematic-debugging` | ⏳ Pending | Migrate as `pi-skills/systematic-debugging/`. |
| 11 | `test-driven-development` | ⏳ Pending | Migrate as `pi-skills/test-driven-development/`. |
| 12 | `finishing-a-development-branch` | ⏳ Pending | Migrate as `pi-skills/finishing-a-development-branch/`. |
| 13 | `writing-skills` | ⏳ Pending | Migrate as `pi-skills/writing-skills/`. |
| — | `using-superpowers` | 🚫 Skip | Entirely about the Superpowers platform itself. Not applicable to Pi. |

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
- Background params (`run_in_background` → `background`)
- Branding (`Superpowers` → neutral, `Claude Code` → `Pi`)
- Pi-native tool integration (`ask_user_question`, `todo`, `Agent` with `subagent_type`)

---

## Updating This Tracker

When you complete a migration:

1. Change the skill's status from ⏳ to ✅
2. Add migration notes (what was tricky, what needed manual work)
3. Update `brainstorming` or other skills that reference it if their docs need path changes
4. Run `./install.sh` to deploy the updated `migrate-superpower` skill

---

## Current Blockers

None. Skills can be migrated in any order. However, if Skill A's workflow invokes Skill B, consider migrating B first so A's references are valid.

Suggested order based on dependency chains:

1. `writing-plans` (referenced by `brainstorming`)
2. `executing-plans` (references `writing-plans`, `verification-before-completion`)
3. `verification-before-completion`
4. Others in any order
