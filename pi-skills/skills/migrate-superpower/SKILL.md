---
name: migrate-superpower
description: "Migrate skills, extensions, or tools from Claude Code / Superpowers ecosystem to Pi. Provides exhaustive replacement rules, path mappings, and platform-specific cleanup. Local source path: /Users/lychee/Documents/superpowers/skills"
---

# Migrate from Claude Code / Superpowers to Pi

A comprehensive migration guide for adapting skills, scripts, documentation, and tooling from the Claude Code / Superpowers ecosystem to Pi.

## When to Use This Skill

- You are porting a skill from `/Users/lychee/Documents/superpowers/skills` to `pi-skills/`
- You are adapting a script or tool that was written for Claude Code
- You are migrating docs, templates, or specs from the Superpowers format to Pi

---

## 0. Default Behavior — Check for Updates

If you invoke this skill **without specifying a target skill**, the default action is to check whether any already-migrated skills have updates in the upstream repository.

**Upstream:** `git@github.com:obra/superpowers.git`

**Process:**

1. Read `pi-skills/migrate-superpower/skill-sha.json` — it lists every ✅ Migrated skill and its recorded SHA.
   > **Not all migrated skills are tracked.** See §3 Skill Name Mappings for which skills are excluded and why.
2. For each skill in that file, fetch the latest SHA from upstream:
   ```bash
   # Run inside the local superpowers repo at /Users/lychee/Documents/superpowers
   git fetch origin main
   git log origin/main -1 --format="%H" -- "skills/<skill-name>/"
   ```
3. Compare upstream SHA with the local record.
4. Report the result:
   - **Up to date** — no action needed.
   - **Out of date** — upstream has changed. Prompt the user to decide:
     - Re-migrate the skill (overwrite with upstream version, then re-apply Pi migration rules)
     - Skip / ignore this update
     - Review the diff first (`git diff <local-sha>..<upstream-sha> -- skills/<skill-name>/`)

If **all skills are up to date**, report that and stop. No further action needed.

> 💡 This check prevents drift. Superpowers skills are actively maintained; running this check periodically ensures the Pi versions do not fall behind.

---

## 1. Directory & File Structure

### Skill Location

| From (Superpowers) | To (Pi) |
|---|---|
| `skills/<name>/SKILL.md` | `pi-skills/<name>/SKILL.md` |
| `skills/<name>/` | `pi-skills/<name>/` |

### Artifacts & Working Directories

| From (Superpowers) | To (Pi) |
|---|---|
| `.superpowers/` | `.lychee/` |
| `.superpowers/brainstorm/` | `.lychee/brainstorm/` |
| `docs/superpowers/specs/` | `.lychee/artifacts/designs/` |
| `docs/superpowers/` | `.lychee/artifacts/` |

### Global Replace Commands

Run these from the skill root before any manual editing:

```bash
# macOS/BSD sed (in-place with backup)
sed -i '' 's/\.superpowers/.lychee/g' **/*
sed -i '' 's/docs\/superpowers\/specs/.lychee\/artifacts\/designs/g' **/*
sed -i '' 's/docs\/superpowers/.lychee\/artifacts/g' **/*

# Linux/GNU sed
sed -i 's/\.superpowers/.lychee/g' **/*
sed -i 's/docs\/superpowers\/specs/.lychee\/artifacts\/designs/g' **/*
sed -i 's/docs\/superpowers/.lychee\/artifacts/g' **/*
```

---

## 2. Skill Frontmatter

Pi uses YAML frontmatter. Ensure the top of `SKILL.md` looks like this:

```yaml
---
name: skill-name
description: "One-line description of what this skill does."
---
```

**No changes needed** if the source already uses this format. Superpowers and Pi both use the same YAML frontmatter convention.

---

## 3. Skill Name Mappings

> 📋 完整迁移状态追踪表见 [`skill-mapping.md`](skill-mapping.md)。

**Rule: Keep the original Superpowers skill name. Do NOT map it to a Pi equivalent.**

The goal is to migrate **all** Superpowers skills as-is. Each skill retains its original name and workflow. If a Pi skill with the same function already exists, the Superpowers version still gets migrated as a separate skill.

| Superpowers Skill | Migration Status | Notes |
|---|---|---|
| `brainstorming` | ✅ Migrated | Already ported. Paths updated to `.lychee/`. **已本地自定义** — `visual-companion.md` 与上游分化（见 §10.5）。 |
| `writing-plans` | ✅ Migrated | Paths updated to `.lychee/artifacts/plans/`; removed `superpowers:` prefix from skill references; removed `using-git-worktrees` context note (Pi does not support worktrees); neutralized branding. |
| `executing-plans` | ✅ Migrated | Removed `superpowers:` prefixes from skill references; replaced `TodoWrite` with `todo` tool; removed `using-git-worktrees` reference (Pi does not support worktrees); neutralized branding. |
| `verification-before-completion` | ✅ Migrated | Pure documentation skill; no platform-specific content. |
| `requesting-code-review` | ✅ Migrated | Replaced `Task tool` with `Agent` tool; updated plan path to `.lychee/artifacts/plans/`. |
| `receiving-code-review` | ✅ Migrated | Migrated as-is. Replaced `CLAUDE.md` with `AGENTS.md`. |
| `dispatching-parallel-agents` | ✅ Migrated | Replaced `Task()` with Pi `Agent` + `background: true`. |
| `subagent-driven-development` | ✅ Migrated | Migrated as-is. Replaced `TodoWrite` with `todo`, `Task tool` with `Agent` tool, removed `using-git-worktrees` reference, updated paths to `.lychee/artifacts/`. |
| `using-git-worktrees` | 🚫 Skip | Pi does not support git worktrees. Remove all references. |
| `systematic-debugging` | 🚫 Skip | Pi already has equivalent debugging capabilities built-in. |
| `test-driven-development` | ✅ Migrated | Pure documentation skill; no platform-specific content. Migrated as-is with no changes. |
| `finishing-a-development-branch` | ✅ Migrated | Already present in `pi-skills/`. |
| `using-superpowers` | 🚫 Skip | Platform-specific to Superpowers; do not migrate. |
| `writing-skills` | ✅ Migrated (no SHA) | Replaced `superpowers:` prefix; updated `CLAUDE.md` references to Pi equivalents (`AGENTS.md`, `.rpiv/guidance/`); updated personal skill paths; neutralized branding; renamed `examples/CLAUDE_MD_TESTING.md` to `AGENTS_MD_TESTING.md`. **Not tracked — see §3.1.** |
| `test-driven-development` | ✅ Migrated (no SHA) | Pure documentation skill; no platform-specific content. Migrated as-is with no changes. **Not tracked — see §3.1.** |

**When a migrated skill references another Superpowers skill:**

- Keep the original name in prose, flowcharts, and prompts
- Update only the **file paths** (e.g., `skills/writing-plans/SKILL.md` → `pi-skills/writing-plans/SKILL.md`)
- Do NOT change "invoke `writing-plans`" to "invoke `plan`"

**Cross-skill references in prompts:**

```
# Before (Superpowers)
Invoke the writing-plans skill.

# After (Pi — name stays the same)
Invoke the `writing-plans` skill.
```

### 3.1. When a Migrated Skill Does NOT Need SHA Tracking

Not every `✅ Migrated` skill needs an entry in `skill-sha.json`. Exclude from tracking when either condition is true:

| Condition | 说明 | 示例 |
|---|---|---|
| **Pure documentation, zero platform-specific content** | 迁移时未做任何替换/修改，直接原样复制。上游更新只是通用最佳实践的改进，不涉及任何需要"重新应用 Pi 迁移规则"的平台适配工作。追踪 SHA 没有实际价值。 | `test-driven-development` |
| **Migrated content has diverged from upstream purpose** | 迁移后已深度本地化为 Pi 生态指南，大量引用 Pi 特有工具（`ask_user_question`、`todo`、`Agent` 工具、CSO 策略等）和 Pi 路径。上游更新的是 Superpowers 版本，与本地 Pi 版本内容目标已不兼容。即使上游有大更新，也无法直接合并。 | `writing-skills` |

**Rule of thumb:** 如果一个技能在上游更新后，重新迁移时不需要（或无法）重新应用任何 Pi 迁移规则，就不需要追踪 SHA。

---

## 4. Tool & API Differences

### Tool Names (Case)

Pi tool names are **lowercase**. Update documentation and comments:

| Claude Code | Pi |
|---|---|
| `Bash` tool | `bash` tool |
| `Write` tool | `write` tool |
| `Read` tool | `read` tool |
| `Edit` tool | `edit` tool |
| `Grep` tool | `grep` tool |
| `Agent` tool | `Agent` tool (capitalized, this one stays) |

### Background Execution

| Claude Code | Pi (tintinweb legacy) | Pi (pi-subagents) |
|---|---|---|
| `run_in_background: true` | `background: true` | `async: true` |

### Agent / Subagent

`pi-subagents` provides a `subagent()` function for dispatching agents. When migrating agent dispatch patterns:

| Claude Code Pattern | pi-subagents Equivalent |
|---|---|
| Generic subagent | Use specific built-in agent: `worker`, `reviewer`, `scout`, `planner`, etc. |
| `Subagent` tool | `subagent({ agent: "...", task: "..." })` |
| Manual process backgrounding | `subagent({ agent: "...", task: "...", async: true })` |

**Built-in agent types and their purposes:**

| Agent | Purpose | When to Use |
|---|---|---|
| `worker` | General implementation agent with edit/write/bash tools. | Default for implementation tasks, fixes, and multi-step code work. |
| `reviewer` | Independent code/spec reviewer. | Reviewing implementations, plans, or diffs for quality and compliance. |
| `scout` | Fast read-only reconnaissance agent. | Gathering diffs, listing files, finding code — no edits. |
| `planner` | Design and architecture agent. | Creating implementation plans, identifying critical files, considering trade-offs. |
| `researcher` | Web research specialist. | Finding information not well-covered in training data (requires `pi-web-access`). |
| `delegate` | Lightweight general-purpose agent. | Simple tasks that don't need the full capability of `worker`. |
| `oracle` | Deep reasoning agent. | Complex analysis requiring broad context and reasoning. |
| `context-builder` | Context preparation agent. | Summarizing and packaging context for other agents. |

**Selection rule:** Prefer the most specific agent for the job. Implementation → `worker`; review → `reviewer`; reconnaissance → `scout`; planning → `planner`.

**Dispatch syntax:**

```typescript
// Single agent
subagent({ agent: "worker", task: "Fix the failing tests in src/foo.test.ts" })

// Parallel agents (tasks array)
subagent({
  tasks: [
    { agent: "worker", task: "Fix abort tests", context: "fresh" },
    { agent: "worker", task: "Fix batch tests", context: "fresh" },
    { agent: "worker", task: "Fix race tests", context: "fresh" }
  ]
})

// Sequential chain
subagent({
  chain: [
    { agent: "scout", task: "Get git diff from BASE to HEAD", output: "diff.txt" },
    { agent: "reviewer", task: "Review the diff in diff.txt", reads: "diff.txt" }
  ]
})

// Background / async
subagent({ agent: "worker", task: "...", async: true })
// Later: check status
subagent({ action: "status", id: "..." })
```

**Key parameters:**

| Parameter | Description |
|---|---|
| `agent` | Required. Built-in agent name or custom agent file name. |
| `task` | Required. Full, self-contained instruction. |
| `async` | Boolean. Launch agent in background and continue. |
| `context` | `"fresh"` (clean session), `"fork"` (inherit parent context). Default varies by agent. |
| `output` | File path to write agent output to. |
| `reads` | File path for agent to read as input. |
| `tasks` | Array for parallel dispatch. Mutually exclusive with `chain`. |
| `chain` | Array for sequential dispatch. Each step's output can feed the next. |

**Post-dispatch actions:**

```typescript
// Check status
subagent({ action: "status", id: "<agent-id>" })

// Interrupt
subagent({ action: "interrupt", id: "<agent-id>" })

// Resume with message
subagent({ action: "resume", id: "<agent-id>", message: "..." })

// List all active agents
subagent({ action: "list" })
```

### Context-Mode (Pi-Specific)

Pi provides `ctx_*` tools for large-output processing. If your migrated skill processes logs, test output, or large files, consider using:

- `ctx_execute` — run code in sandbox and summarize output
- `ctx_execute_file` — analyze a large file without loading it into context
- `ctx_search` — search previously indexed content
- `ctx_index` — index docs or code for later retrieval

Claude Code has no equivalent. If the source skill mentions "process large output" or "analyze logs," add context-mode guidance.

---

## 5. Pi-Native Tools

These tools exist in Pi but have no direct equivalent in Claude Code. When migrating skills that describe workflow or user interaction patterns, incorporate these tools.

### ask_user_question

**Claude Code:** No structured questioning tool; the agent asks questions inline as free-form text.

**Pi:** Use the `ask_user_question` tool for structured, interactive questioning. Benefits over free-form:

- Enforced single-select / multi-select semantics
- Side-by-side preview support (ASCII mockups, code snippets)
- Automatic "Type something." escape hatch (except when `multiSelect: true` or `preview` is present)
- Up to 4 questions per call, 2–4 options each

**Migration rule:** If the source skill instructs "ask the user one question at a time" or "present multiple choice options," update to use `ask_user_question`.

**Key Pi behaviors to document in the skill:**

- `multiSelect: true` suppresses the "Type something." row
- Any option with a non-empty `preview` also suppresses "Type something." (side-by-side layout)
- Questions must end with `?`
- Option labels max 60 chars, headers max 16 chars
- Recommended option should be first with "(Recommended)" suffix

**Example migration:**

```
# Before (Claude Code style)
Ask the user: "Which approach do you prefer? A, B, or C?"

# After (Pi style)
Use ask_user_question with a single question containing 2-4 options.
```

### todo

**Claude Code:** No built-in task tracker. Skills may maintain checklists in prose (Markdown bullet lists).

**Pi:** Use the `todo` tool to create, update, and track tasks programmatically.

**Migration rule:** If the source skill contains a multi-step checklist (e.g., brainstorming's 9-step process), add instructions to create `todo` tasks for each step.

**Key Pi behaviors:**

- Status: `pending` → `in_progress` → `completed`
- `activeForm` — present-continuous label shown while `in_progress` (e.g., "writing tests")
- `blockedBy` — task dependencies using task IDs
- Never mark completed if tests fail or implementation is partial
- Exactly one task should be `in_progress` at a time
- Skip `todo` for single trivial tasks and purely conversational requests

**Example migration:**

```
# Before (Claude Code style)
## Checklist
- [ ] Explore project context
- [ ] Ask clarifying questions
- [ ] Propose approaches

# After (Pi style)
At the start of the workflow, create a todo for each step:
todo create: subject="Explore project context", status=pending
todo create: subject="Ask clarifying questions", status=pending, blockedBy=[id1]
...
Mark in_progress before beginning work, completed when done.
```

### Agent (Subagent Dispatch)

**Claude Code:** Subagent support is limited; may use generic background processes or simple tool calls.

**Pi (tintinweb legacy):** Rich `Agent` tool with typed subagents via `subagent_type`.

**Pi (pi-subagents):** `subagent()` function with built-in agents.

**Migration rule:** If the source skill dispatches "subagents" or "parallel workers," replace with `pi-subagents` `subagent()` syntax.

**From tintinweb:**

```xml
<!-- Old tintinweb syntax — REMOVE -->
<Agent
  subagent_type="general-purpose"
  description="Fix abort tests"
  prompt="..."
  background="true"
/>
```

**To pi-subagents:**

```typescript
// Single agent
subagent({ agent: "worker", task: "Fix the failing tests..." })

// Parallel agents
subagent({
  tasks: [
    { agent: "worker", task: "Fix abort tests...", context: "fresh" },
    { agent: "worker", task: "Fix batch tests...", context: "fresh" }
  ]
})
```

**Key parameters:**

| Parameter | Description |
|---|---|
| `agent` | Required. Built-in name (`worker`, `reviewer`, `scout`, `planner`, etc.) or custom agent file. |
| `task` | Required. Full, self-contained instruction. |
| `async` | Boolean. Background execution (returns immediately). |
| `context` | `"fresh"` for clean session, `"fork"` to inherit parent. |

**Post-dispatch:**

```typescript
subagent({ action: "status", id: "<agent-id>" })
subagent({ action: "interrupt", id: "<agent-id>" })
subagent({ action: "resume", id: "<agent-id>", message: "..." })
```

### Task Syntax (Claude Code Specific)

Claude Code supports a `Task()` shorthand for dispatching parallel agents:

```typescript
// Claude Code — REMOVE or replace
Task("Fix abort test failures")
Task("Fix batch test failures")
```

`pi-subagents` has no `Task()` shorthand. Use `subagent({ tasks: [...] })`:

```typescript
// Pi-subagents — correct replacement
subagent({
  tasks: [
    { agent: "worker", task: "Fix abort test failures...", context: "fresh" },
    { agent: "worker", task: "Fix batch test failures...", context: "fresh" }
  ]
})
```

**Migration rule:** When the source skill shows `Task("...")` examples, replace with `subagent({ tasks: [...] })`.

**Reference:** See Pi docs at `docs/skills.md` for agent selection guidance.

**Reference:** See Pi docs at `docs/skills.md` for subagent type selection guidance.

---

## 6. Shell Script Cleanup

### Remove Platform-Specific Auto-Detection

**Delete these blocks entirely:**

```bash
# Codex — REMOVE
if [[ -n "${CODEX_CI:-}" && "$FOREGROUND" != "true" && "$FORCE_BACKGROUND" != "true" ]]; then
  FOREGROUND="true"
fi
```

```bash
# Windows/Git Bash IDE detection — REMOVE
if [[ "$FOREGROUND" != "true" && "$FORCE_BACKGROUND" != "true" ]]; then
  case "${OSTYPE:-}" in
    msys*|cygwin*|mingw*) FOREGROUND="true" ;;
  esac
  if [[ -n "${MSYSTEM:-}" ]]; then
    FOREGROUND="true"
  fi
fi
```

```bash
# Owner PID tracking for Claude Code — REMOVE or simplify
OWNER_PID="$(ps -o ppid= -p "$PPID" 2>/dev/null | tr -d ' ')"
```

**Keep only generic logic:**

- Standard Unix: `nohup` + `disown` for backgrounding
- Explicit `--foreground` flag for environments that reap detached processes
- Explicit `--background` flag to force background mode

### Comment & Help Text Cleanup

| From | To |
|---|---|
| `overrides Codex auto-foreground` | `overrides auto-foreground` |
| `Claude Code (macOS / Linux):` | Remove header; keep generic Unix instructions |
| `Claude Code (Windows):` | Remove header; keep generic Windows instructions if applicable |
| `Codex:` | Remove section |
| `Gemini CLI:` | Remove section |
| `Other environments:` | Remove; generic instructions cover all cases |

---

## 7. Documentation Content

### Branding & Titles

| From | To |
|---|---|
| `Superpowers Brainstorming` | `Brainstorm Companion` or generic title |
| `Superpowers` (as product name) | Remove or neutralize |
| Links to `github.com/obra/superpowers` | Remove or replace with neutral branding |
| `Claude` / `Claude Code` in prose | Replace with `Pi` or `agent` |

### Skill Invocation Syntax

Claude Code skills are invoked via conversation cues. Pi skills are invoked via XML block:

```xml
<!-- Pi skill invocation -->
<skill name="brainstorming" location="skills/brainstorming/SKILL.md">
  <!-- skill body -->
</skill>
```

If the source skill describes "how to invoke this skill," update to Pi's XML invocation format.

### HTML / Template IDs

In HTML frame templates or visual companions:

| From | To |
|---|---|
| `id="claude-content"` | `id="agent-content"` or `id="content"` |
| `id="claude-sidebar"` | `id="sidebar"` |
| CSS `#claude-content` | `#agent-content` |
| `<!-- Claude injects here -->` | `<!-- agent injects here -->` or remove |

### Process Flow References

Keep skill names **exactly as they are in the source**. Do NOT rename `writing-plans` to `plan`, `executing-plans` to `implement`, etc.

Only update **file paths** within the skill:

```
# Before
Invoke the writing-plans skill.

# After
Invoke the `writing-plans` skill.
```

If a flowchart (`dot` diagram) references another skill, keep the label text unchanged. Only update edge targets if they point to file paths.

### Spec / Design Doc Paths

Update all written references:

```
# Before
docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md

# After
.lychee/artifacts/designs/YYYY-MM-DD-<topic>-design.md
```

Also update any inline paths in:

- Skill checklists
- Prompt templates
- Example commands
- `.gitignore` recommendations (`.superpowers/` → `.lychee/`)

---

## 8. Verification Commands

After applying replacements, run these checks:

```bash
# Check for remaining Superpowers references
grep -ri "superpowers" pi-skills/YOUR-SKILL/ || echo "OK: no superpowers refs"

# (No old skill name checks — we keep original Superpowers names)

# Check for platform-specific env vars
grep -ri "CODEX_CI" pi-skills/YOUR-SKILL/ || echo "OK: no CODEX_CI refs"
grep -ri "MSYSTEM" pi-skills/YOUR-SKILL/ || echo "OK: no MSYSTEM refs"

# Check for old paths
grep -ri "\.superpowers" pi-skills/YOUR-SKILL/ || echo "OK: no .superpowers refs"
grep -ri "docs/superpowers" pi-skills/YOUR-SKILL/ || echo "OK: no docs/superpowers refs"

# Check for branding
grep -ri "claude code" pi-skills/YOUR-SKILL/ || echo "OK: no Claude Code refs"
grep -ri "github.com/obra" pi-skills/YOUR-SKILL/ || echo "OK: no obra refs"

# Check for wrong tool casing in docs
grep -ri "\bBash\b" pi-skills/YOUR-SKILL/*.md || echo "OK: no Bash refs"
grep -ri "\bWrite\b" pi-skills/YOUR-SKILL/*.md || echo "OK: no Write refs"

# Check for legacy project guidance file references
grep -ri "CLAUDE.md" pi-skills/YOUR-SKILL/ || echo "OK: no CLAUDE.md refs"
grep -ri "~/.claude/skills" pi-skills/YOUR-SKILL/ || echo "OK: no ~/.claude/skills refs"

# Check for old tintinweb agent syntax
grep -ri "subagent_type" pi-skills/YOUR-SKILL/ || echo "OK: no subagent_type refs"
grep -ri "run_in_background" pi-skills/YOUR-SKILL/ || echo "OK: no run_in_background refs"
grep -ri "get_subagent_result" pi-skills/YOUR-SKILL/ || echo "OK: no get_subagent_result refs"
grep -ri "steer_subagent" pi-skills/YOUR-SKILL/ || echo "OK: no steer_subagent refs"
```

---

## 9. Common Pitfalls

### 9.1 Path in Comments vs Code

Comments often contain example paths. `sed` catches string matches, but verify manually:

```bash
# This sed catches it:
sed -i '' 's/\.superpowers/.lychee/g' **/*

# But double-check comments like:
# "Store files under <project>/.superpowers/brainstorm/"
# → "Store files under <project>/.lychee/brainstorm/"
```

### 9.2 Git Ignore

If the source mentions `.gitignore`, ensure the recommended pattern is updated:

```gitignore
# Before
.superpowers/

# After
.lychee/
```

### 9.3 Script Shebangs

No changes needed for standard `#!/usr/bin/env bash` or `#!/usr/bin/env node` shebangs. Pi runs in the same shell environment as Claude Code.

### 9.4 Node.js / Python Dependencies

If the skill includes scripts with `package.json` or `requirements.txt`:

- No platform migration needed for the code itself
- Update any docs that mention "Claude Code's Node version" to Pi's runtime
- Pi uses Bun where available; `npm` and `npx` still work

### 9.5 Subagent Prompts

If the skill dispatches subagents with hardcoded prompts mentioning "Claude":

```
# Before
You are a Claude Code subagent...

# After
You are a Pi subagent...
```

Or better, make it generic:

```
You are a coding assistant subagent...
```

### 9.6 Project Guidance File References (`CLAUDE.md`)

Superpowers/Claude Code uses `CLAUDE.md` as the project-level guidance file. In Pi, the equivalent is `AGENTS.md` (global, under `~/.pi/agent/`) or `.rpiv/guidance/` (project-level shadow tree).

When migrating skills that reference `CLAUDE.md`:

| From | To |
|---|---|
| `put in CLAUDE.md` | `put in AGENTS.md or .rpiv/guidance/` |
| `examples/CLAUDE_MD_TESTING.md` | `examples/AGENTS_MD_TESTING.md` |
| `No mention of skills in CLAUDE.md` | `No mention of skills in AGENTS.md` |

**Personal skills paths** also differ:

| From | To |
|---|---|
| `~/.claude/skills/` | `~/.pi/agent/skills/` |
| `~/.agents/skills/` | `~/.pi/agent/skills/` |

**Pitfall:** `sed` may produce duplicate paths if both `~/.claude/skills` and `~/.agents/skills/` were present in the source. Verify the result does not read `~/.pi/agent/skills for Pi, ~/.pi/agent/skills/ for Pi`.

### 9.7 Superpowers Skill Namespace Prefix

Some Superpowers skills reference other skills using a colon prefix:

```
# Before
Use superpowers:finishing-a-development-branch
Invoke superpowers:subagent-driven-development
```

In Pi, skills have no namespace prefix. Remove `superpowers:` entirely:

```
# After
Use `finishing-a-development-branch`
Invoke `subagent-driven-development`
```

**Checklist:**

- Search for `superpowers:` in prose, prompts, and checklists
- Remove the prefix but keep the original skill name
- Do NOT replace with a Pi-equivalent name (e.g., keep `writing-plans`, do not change to `plan`)

---

## 10. Post-Migration Checklist

- [ ] Directory renamed to `pi-skills/<name>/`
- [ ] `SKILL.md` frontmatter is valid YAML with `name` and `description`
- [ ] No `.superpowers/` references remain
- [ ] No `docs/superpowers/` references remain
- [ ] No `CODEX_CI`, `MSYSTEM`, or `Codex` specific logic remains
- [ ] No `Claude Code` specific instructions remain
- [ ] No `Gemini CLI` specific instructions remain
- [ ] Tool names in docs use lowercase (`bash`, `write`, `read`, `edit`, `grep`)
- [ ] Background process parameters use `background` (not `run_in_background`)
- [ ] Design doc paths point to `.lychee/artifacts/designs/`
- [ ] `.gitignore` recommendations use `.lychee/`
- [ ] Branding/titles are neutral (no `Superpowers`, `Claude`, `obra`)
- [ ] HTML IDs and CSS selectors are brand-neutral
- [ ] Subagent prompts are generic or mention Pi
- [ ] `ask_user_question` is used for structured questioning (not free-form)
- [ ] `todo` is used for multi-step workflow tracking (not Markdown checklists)
- [ ] `Agent` tool uses appropriate `subagent_type` (not generic "subagent")
- [ ] `subagent()` uses correct `agent` name (not `subagent_type`)
- [ ] Parallel dispatch uses `tasks` array (not multiple `Agent` calls)
- [ ] Background execution uses `async: true` (not `run_in_background`)
- [ ] Sequential workflows use `chain` array where appropriate
- [ ] No `get_subagent_result` or `steer_subagent` references remain
- [ ] All verification commands pass
- [ ] `./install.sh` runs without errors
- [ ] Pi reloads and recognizes the new skill

---

## 10.5. 已迁移技能的本地自定义记录

以下技能在迁移后经过了**本地自定义修改**，与上游 Superpowers 版本存在显著差异。若将来需要重新迁移（上游有更新），必须在重新迁移后**重新应用**这些本地改动。

### `brainstorming`

**上游 SHA:** `9f04f0635114d09ca054778e2dd44942efd1c008`

**本地修改摘要（相对于上游）：**

仅在 `visual-companion.md` 中有修改。`SKILL.md`、`spec-document-reviewer-prompt.md` 等其他文件与上游一致。

| 改动 | 上游行为 | 本地行为 |
|---|---|---|
| **交互流程** | 轮询模式 — agent 展示页面后结束回合，用户需回到终端打字推进下一回合，agent 再调用 `visual_companion_read_events` 获取事件 | 阻塞模式 — agent 展示页面后立即调用 `visual_companion_wait`，用户点确认后 agent **自动**获得 confirm 事件，无需终端打字 |
| **工具数量描述** | "provides four tools"（`start`/`show`/`read_events`/`stop`） | "provides five tools"（增加 `visual_companion_wait`） |
| **核心流程章节** | "The Loop" 步骤 3 写的是 "On your next turn — after the user responds in the terminal" 后调用 `read_events` | "The Loop" 步骤 3 改为 "Call `visual_companion_wait`" 阻塞等待确认 |
| **事件获取文档** | 仅 `visual_companion_read_events` | 新增 `visual_companion_wait` 为主要方式，`read_events` 作为 fallback |
| **Fallback 保留** | — | 新增 "Reading Events Without Waiting" 小节，保留 `read_events` 用于诊断或非阻塞场景 |

**修改动机：** 向上游提了 PR 但未被合并。原轮询流程要求用户确认后还要切回终端打字，体验割裂。本地改为 `visual_companion_wait` 后，用户在浏览器点"确认"即可自动推进对话。

**重新迁移时的操作步骤：**

1. 从上游重新迁移 `brainstorming` 技能
2. 仅需对比并更新 `visual-companion.md`：
   - 检查上游版本有无新增内容（CSS 类、事件类型、设计建议等）
   - 将上游新增内容合并到本地版本
   - **保留**本地 `visual_companion_wait` 阻塞流程，不要回退到轮询模式
   - 保留 Fallback 小节
3. 更新 `skill-sha.json` 中的 SHA
4. 运行 `./install.sh` 部署

### `finishing-a-development-branch`

**上游 SHA:** `f2cbfbefebbfef77321e4c9abc9e949826bea9d7`

**本地修改摘要（相对于上游）：**

| 改动 | 上游行为 | 本地行为 |
|---|---|---|
| **选项数量** | 4 个选项 | 5 个选项 |
| **Option 1** | `Merge back to <base-branch> locally` — 本地合并后删除分支 | **移除该选项** |
| **新增 Option 1** | — | `Batch commit, push, and create PR` — 分批 commit、推送、创建 PR |
| **新增 Option 2** | — | `Batch commit and push` — 分批 commit、推送（不创建 PR） |
| **新增 Option 3** | — | `Batch commit only` — 仅分批 commit（本地） |
| **Option 4** | `Keep the branch as-is` | `Do nothing` — 语义相同，名称更明确 |
| **Option 5** | `Discard this work` — 删除整个分支 (`git branch -D`) | `Rollback uncommitted changes` — 仅丢弃未提交改动 (`git checkout -- .` + `git clean -fd`)，**保留分支** |
| **确认词** | 输入 `discard` 确认删除 | 输入 `rollback` 确认回滚 |
| **Clean Up** | Option 1 和 4 执行清理 | **无需清理** — Option 5 不删除分支 |
| **Quick Reference** | 4 行选项表 | 5 行选项表，所有选项重新命名 |
| **Common Mistakes** | "Deleting branch before confirming merge success" | 改为 "Single giant commit instead of batch commits" |
| **Red Flags** | 包含 "Merge without verifying tests on result" | 移除（已无 merge 操作） |

**重新迁移时的操作步骤：**

1. 从上游重新迁移 `finishing-a-development-branch`
2. 对比上游版本与本地版本，重新应用上述改动
3. 特别注意：
   - 删除 "Merge Locally" 选项及其所有引用
   - 将 "Discard" 改为 "Rollback uncommitted changes"（不删除分支）
   - 确保 Quick Reference 表格和 Common Mistakes 与本地一致
4. 更新 `skill-sha.json` 中的 SHA
5. 运行 `./install.sh` 部署

---

## 11. 迁移维护义务（Meta Rule）

每次执行迁移时，**必须同步更新本 skill 本身，skill 源文件地址 /Users/lychee/Documents/configure/pi-skills/migrate-superpower**：

1. **更新 mapping 列表**
   - 修改本文件 §3 中的迁移状态表
   - 将刚迁移的 skill 状态从 `⏳ Pending` 改为 `✅ Migrated`
   - 补充迁移备注（遇到的特殊问题、手动处理的内容）

2. **将新发现写入本 skill**
   - 如果迁移过程中发现了新的平台差异、工具行为变化或边界情况
   - 将发现补充到 `SKILL.md` 的对应章节（或新增 Common Pitfalls 条目）
   - 确保后续迁移能从本次经验中受益

3. **更新 skill-sha.json**
   - 远端仓库：`git@github.com:obra/superpowers.git`
   - 文件位置：`pi-skills/migrate-superpower/skill-sha.json`
   - 记录的是**整个 skill 目录**的最新 commit sha（不是单个 `SKILL.md`）
   - 获取命令（在 superpowers 仓库根目录执行）：
     ```bash
     git log -1 --format="%H" -- "skills/<skill-name>/"
     ```
   - 用途：追踪 superpowers 源端是否有更新。若远端 sha 与本地记录不一致，说明源 skill 有变动，需评估是否重新迁移。
   - 只有状态为 `✅ Migrated` 的 skill 才需要记录 sha；`⏳ Pending` 和 `🚫 Skip` 的不记录。
   - 状态为 `✅ Migrated (no SHA)` 的技能见 §3.1，已明确排除追踪。

4. **更新目录**
   - 确认 `/Users/lychee/Documents/configure/pi-skills/migrate-superpower/` 下的文件已反映最新认知
   - 运行 `./install.sh` 部署更新后的 skill

**原则：** 迁移不是一次性搬运，而是持续完善迁移知识库的过程。每次迁移都应让 `migrate-superpower` 变得更准确、更完整。

---

## 12. After Migration

1. Run `./install.sh` to deploy
2. Restart or `/reload` Pi to pick up the new skill
3. Test shell scripts manually to confirm backgrounding behavior
4. Verify skill appears in Pi's skill list
