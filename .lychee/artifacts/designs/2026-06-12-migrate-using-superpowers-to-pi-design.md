# Design: Migrate `using-superpowers` to Pi

## Status

Design approved by user. Ready for implementation planning.

## Goal

Migrate the Superpowers meta-skill `using-superpowers` into the Pi skills directory (`pi-skills/using-superpowers/`) as a Pi-native meta-skill. It must teach Pi how to discover and invoke skills before every response, while removing all Superpowers-platform-specific content.

## Constraints & Decisions

| Decision | Choice |
|---|---|
| Skill name | Keep `using-superpowers` (no rename) |
| Migration strategy | Full Pi-native rewrite |
| `references/` directory | Keep, but only `pi-tools.md` |
| Platform reference files (`codex-tools.md`, `copilot-tools.md`, `gemini-tools.md`) | Delete |
| DOT flowchart | Keep and rewrite for Pi |
| Claude Code comparison table in `references/pi-tools.md` | Do not include |
| `migrate-superpower` update | Full update: mapping table, skill-mapping.md, no-SHA rationale, tool differences, verification commands, pitfalls, checklist, local customization record |

## Target Directory Structure

```
pi-skills/using-superpowers/
├── SKILL.md
└── references/
    └── pi-tools.md
```

## `SKILL.md` Structure

### Frontmatter

```yaml
---
name: using-superpowers
description: Use when starting any conversation — establishes how to find and invoke Pi skills, requiring skill invocation before ANY response including clarifying questions
---
```

### Sections

1. **Hard Gate**
   - If there is even a 1% chance a skill applies, invoke it first.
   - Exception: skip if dispatched as a subagent to execute a specific task.
   - Use Pi XML `<skill>` block, not a tool call.

2. **Instruction Priority**
   1. User explicit instructions (`AGENTS.md`, `.rpiv/guidance/`, direct requests)
   2. Pi skills
   3. Default system prompt

3. **How to Access Skills**
   - Pi loads skills via XML block injected into context.
   - System discovers skills from `~/.pi/agent/skills/` and project-level `.pi/skills/`.
   - Example:
     ```xml
     <skill name="brainstorming" location="/Users/lychee/.pi/agent/skills/brainstorming/SKILL.md">
       <!-- skill body -->
     </skill>
     ```

4. **Pi Tool Mapping (concise)**
   - Small inline table covering the most commonly referenced tools.
   - Full mapping lives in `references/pi-tools.md`.

5. **Using Skills Flow**
   - Rewritten DOT diagram:
     - `Invoke Skill tool` → `Pi loads skill via XML block`
     - `Create TodoWrite todo per item` → `Create todo tasks per item`
     - `About to EnterPlanMode?` → `About to plan mode?`

6. **Red Flags**
   - Keep the 12 cognitive traps, wording neutralized for Pi.

7. **Skill Priority & Types**
   - Process skills first, implementation skills second.
   - Rigid vs Flexible classification remains.

8. **User Instructions**
   - Instructions say WHAT, not HOW. "Add X" does not skip workflows.

## `references/pi-tools.md` Structure

A Pi tool quick-reference covering:

1. Skill Invocation (XML block)
2. Core File Tools (`read`, `write`, `edit`, `find`, `ls`)
3. Execution & Shell (`bash`)
4. Task & Workflow (`todo`)
5. User Interaction (`ask_user_question`)
6. Subagents (`subagent`, `get_subagent_result`, `steer_subagent`)
7. Research (`web_search`, `web_fetch`)
8. Visual Companion (`visual_companion_start`, `show`, `wait`, `read_events`, `stop`)
9. MCP Gateway (`mcp`)

No comparison tables to Claude Code, Copilot CLI, Gemini CLI, or Codex.

## `migrate-superpower` Updates

### `SKILL.md`

1. §3 Skill Name Mappings
   - Change `using-superpowers` from `🚫 Skip` to `✅ Migrated (no SHA)`
   - Note: Migrated as Pi-native meta skill. Removed platform-specific references. Kept only `references/pi-tools.md`.

2. §3.1 No-SHA Tracking
   - Add `using-superpowers` under the "migrated content has diverged from upstream purpose" category.

3. §4 Tool & API Differences
   - Add subsection: **Skill Invocation Difference**
     - Superpowers: `Skill` tool / `skill` tool / `activate_skill`
     - Pi: XML `<skill>` block

4. §7 Documentation Content
   - Add subsection: **Platform-specific meta skills**
     - Delete other-platform invocation instructions.
     - Replace with Pi skill-loading mechanism.
     - Keep core discipline rules.
     - Keep only Pi tool reference files.

5. §8 Verification Commands
   - Add:
     ```bash
     grep -ri "Claude Code\|Copilot CLI\|Gemini CLI\|Codex" pi-skills/using-superpowers/ || echo "OK"
     grep -ri "Skill tool\|activate_skill\|skill tool" pi-skills/using-superpowers/ || echo "OK"
     ```

6. §9 Common Pitfalls
   - Add:
     - Meta skills need full rewrite, not just string replacement.
     - Delete other-platform reference files, do not rename them.
     - Skill invocation in Pi is not a tool call.

7. §10 Post-Migration Checklist
   - Add items:
     - No references to external platforms remain.
     - Skill invocation is described as XML `<skill>` block.
     - Only Pi-specific reference files remain in `references/`.
     - Meta skill still enforces skill-first hard gate.

8. §10.5 Local Customization Record
   - Add `using-superpowers` entry:
     - Upstream SHA: not tracked
     - Local changes: full Pi rewrite; removed other-platform references; rewrote DOT diagram; added `references/pi-tools.md`.
     - Re-migration: must re-apply Pi rewrite from scratch.

### `skill-mapping.md`

- Update status table: `using-superpowers` → `✅ Migrated (no SHA)`
- Update notes to match `SKILL.md`.

### `skill-sha.json`

- Do **not** add `using-superpowers`. It is explicitly excluded from SHA tracking.

## Verification Plan

1. File checks:
   ```bash
   cd /Users/lychee/Documents/configure
   grep -ri "Claude Code\|Copilot CLI\|Gemini CLI\|Codex\|superpowers" pi-skills/using-superpowers/ || echo "OK"
   grep -ri "Skill tool\|activate_skill" pi-skills/using-superpowers/ || echo "OK"
   grep -ri "\.superpowers\|docs/superpowers" pi-skills/using-superpowers/ || echo "OK"
   ```

2. Run `./install.sh` to deploy.
3. In Pi, run `/reload` and confirm `using-superpowers` appears.
4. Confirm `migrate-superpower` changes deploy successfully.
