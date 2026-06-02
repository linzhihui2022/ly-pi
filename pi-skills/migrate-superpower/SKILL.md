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

**Rule: Keep the original Superpowers skill name. Do NOT map it to a Pi equivalent.**

The goal is to migrate **all** Superpowers skills as-is. Each skill retains its original name and workflow. If a Pi skill with the same function already exists, the Superpowers version still gets migrated as a separate skill.

| Superpowers Skill | Migration Status | Notes |
|---|---|---|
| `brainstorming` | ✅ Migrated | Already ported. Paths updated to `.lychee/`. |
| `writing-plans` | ✅ Migrated | Paths updated to `.lychee/artifacts/plans/`; removed `superpowers:` prefix from skill references; removed `using-git-worktrees` context note (Pi does not support worktrees); neutralized branding. |
| `executing-plans` | ✅ Migrated | Removed `superpowers:` prefixes from skill references; replaced `TodoWrite` with `todo` tool; removed `using-git-worktrees` reference (Pi does not support worktrees); neutralized branding. |
| `verification-before-completion` | ✅ Migrated | Pure documentation skill; no platform-specific content. |
| `requesting-code-review` | ⏳ Pending | Migrate as-is. |
| `receiving-code-review` | ⏳ Pending | Migrate as-is. |
| `dispatching-parallel-agents` | ✅ Migrated | Replaced `Task()` with Pi `Agent` + `background: true`. |
| `subagent-driven-development` | ✅ Migrated | Migrated as-is. Replaced `TodoWrite` with `todo`, `Task tool` with `Agent` tool, removed `using-git-worktrees` reference, updated paths to `.lychee/artifacts/`. |
| `using-git-worktrees` | 🚫 Skip | Pi does not support git worktrees. Remove all references. |
| `systematic-debugging` | ⏳ Pending | Migrate as-is. |
| `test-driven-development` | ⏳ Pending | Migrate as-is. |
| `finishing-a-development-branch` | ✅ Migrated | Already present in `pi-skills/`. |
| `using-superpowers` | 🚫 Skip | Platform-specific to Superpowers; do not migrate. |
| `writing-skills` | ⏳ Pending | Migrate as-is. |

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

| Claude Code | Pi |
|---|---|
| `run_in_background: true` | `background: true` |
| `run_in_background` | `background` |

### Agent / Subagent

Pi has a rich subagent ecosystem. When migrating agent dispatch patterns:

| Claude Code Pattern | Pi Equivalent |
|---|---|
| Generic subagent | Use specific type: `Explore`, `Plan`, `codebase-analyzer`, `codebase-pattern-finder`, etc. |
| `Subagent` tool | `Agent` tool with `subagent_type` parameter |
| Manual process backgrounding | `Agent` with `run_in_background: true` |

Pi subagent types and their purposes:

| Subagent Type | Purpose | When to Use |
|---|---|---|
| `general-purpose` | General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. | Default fallback when no specialized type fits. |
| `Explore` | Fast read-only search agent for locating code. | Finding files by pattern, grepping for symbols or keywords, answering "where is X defined / which files reference Y." |
| `Plan` | Software architect agent for designing implementation plans. | Designing implementation strategy, identifying critical files, considering architectural trade-offs. |
| `codebase-analyzer` | Analyzes codebase implementation details. | Tracing one component end-to-end, understanding HOW code works, data flow analysis. |
| `codebase-locator` | Locates files, directories, and components. | "Super grep/find/ls" — when you would otherwise reach for grep/find/ls more than once. |
| `codebase-pattern-finder` | Finds similar implementations and existing patterns. | Looking for concrete code examples, usage patterns, or templates to model after. |
| `integration-scanner` | Finds what connects to a given component. | Mapping inbound references, outbound dependencies, config registrations, event subscriptions (reverse-reference counterpart to `codebase-locator`). |
| `peer-comparator` | Pairwise peer-invariant comparator. | When a new entity parallels an existing sibling (aggregate, service, handler, reducer, repository) and must be checked against the peer's public surface. |
| `precedent-locator` | Finds similar past changes in git history. | Mining commits, blast radius, follow-up fixes, and lessons from related `.rpiv/artifacts/` docs. |
| `scope-tracer` | Traces the scope of a research investigation. | Sweeping anchor terms across the codebase, reading key files for depth, returning a Discovery Summary + dense numbered questions. |
| `slice-verifier` | Per-slice adversarial verifier for incremental plan generation. | Auditing a just-generated slice against shared contracts, locked prior slices, and recorded constraints before it is locked. |
| `artifact-code-reviewer` | Independent post-finalization code reviewer. | Walking each slice code fence against code quality, codebase fit, and actionability dimensions after a plan/design is finalized. |
| `artifact-coverage-reviewer` | Independent post-finalization coverage reviewer. | Walking every `## Verification Notes` and `## Precedents & Lessons` entry to verify each lands somewhere actionable. |
| `artifacts-analyzer` | Deep dive on research topics from `.rpiv/artifacts/` docs. | Extracting high-value insights from artifact documents, filtering noise, validating relevance. |
| `artifacts-locator` | Finds relevant documents in `.rpiv/artifacts/`. | Discovering prior research, designs, plans, or reviews relevant to the current task. |
| `diff-auditor` | Row-only patch auditor. | Walking a patch against a caller-supplied surface-list, emitting one row per matching pattern. |
| `claim-verifier` | Adversarial finding verifier. | Grounding each supplied claim against actual repository state (Verified / Weakened / Falsified). |
| `web-search-researcher` | Expert web research specialist. | Finding information not well-covered in training data, modern documentation, or discoverable only on the web. |

**Selection rule:** Prefer the most specific subagent type over `general-purpose`. If the task is "find files" → `codebase-locator`; if it's "understand how X works" → `codebase-analyzer`; if it's "review a finalized plan" → `artifact-code-reviewer`.

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

**Pi:** Rich `Agent` tool with typed subagents.

**Migration rule:** If the source skill dispatches "subagents" or "parallel workers," replace with Pi's `Agent` tool and select an appropriate `subagent_type`.

**Pi-specific parameters:**

| Parameter | Description |
|---|---|
| `subagent_type` | Required. See the selection table in §4 Agent / Subagent for guidance. Options: `general-purpose`, `Explore`, `Plan`, `codebase-analyzer`, `codebase-locator`, `codebase-pattern-finder`, `integration-scanner`, `peer-comparator`, `precedent-locator`, `scope-tracer`, `slice-verifier`, `artifact-code-reviewer`, `artifact-coverage-reviewer`, `artifacts-analyzer`, `artifacts-locator`, `diff-auditor`, `claim-verifier`, `web-search-researcher` |
| `description` | 3–5 word summary shown in UI |
| `prompt` | Full, self-contained instruction |
| `run_in_background` | Boolean. Launch agent in background and continue |
| `isolation: "worktree"` | ~~Run in isolated git worktree~~ — **Pi does not support worktrees. Do not use.** |
| `inherit_context` | Fork parent conversation into agent |
| `model` | Override model, e.g. `"haiku"`, `"sonnet"` |
| `thinking` | Thinking level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh` |
| `max_turns` | Limit agentic turns |

**Post-dispatch tools:**

- `get_subagent_result(agent_id)` — check status and retrieve results
- `steer_subagent(agent_id, message)` — send mid-run steering message

**Migration of background processes:**

```
# Before (Claude Code)
Bash tool with run_in_background: true

# After (Pi)
Agent tool with run_in_background: true, or bash tool with background: true
```

### Task Syntax (Claude Code Specific)

Claude Code supports a `Task()` shorthand for dispatching parallel agents:

```typescript
// Claude Code — REMOVE or replace
Task("Fix abort test failures")
Task("Fix batch test failures")
```

Pi has no `Task()` shorthand. Use the `Agent` tool with `background: true`:

```xml
<!-- Pi — correct replacement -->
<Agent
  subagent_type="general-purpose"
  description="Fix abort tests"
  prompt="..."
  background="true"
/>
```

**Migration rule:** When the source skill shows `Task("...")` examples, replace with full `Agent` tool XML and add `background: true`.

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
```

---

## 9. Common Pitfalls

### 8.1 Path in Comments vs Code

Comments often contain example paths. `sed` catches string matches, but verify manually:

```bash
# This sed catches it:
sed -i '' 's/\.superpowers/.lychee/g' **/*

# But double-check comments like:
# "Store files under <project>/.superpowers/brainstorm/"
# → "Store files under <project>/.lychee/brainstorm/"
```

### 8.2 Git Ignore

If the source mentions `.gitignore`, ensure the recommended pattern is updated:

```gitignore
# Before
.superpowers/

# After
.lychee/
```

### 8.3 Script Shebangs

No changes needed for standard `#!/usr/bin/env bash` or `#!/usr/bin/env node` shebangs. Pi runs in the same shell environment as Claude Code.

### 8.4 Node.js / Python Dependencies

If the skill includes scripts with `package.json` or `requirements.txt`:

- No platform migration needed for the code itself
- Update any docs that mention "Claude Code's Node version" to Pi's runtime
- Pi uses Bun where available; `npm` and `npx` still work

### 8.5 Subagent Prompts

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

### 8.6 Superpowers Skill Namespace Prefix

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
- [ ] All verification commands pass
- [ ] `./install.sh` runs without errors
- [ ] Pi reloads and recognizes the new skill

---

## 11. 迁移维护义务（Meta Rule）

每次执行迁移时，**必须同步更新本 skill 本身**：

1. **更新 mapping 列表**
   - 修改 `skill-mapping.md` 中的迁移状态表
   - 将刚迁移的 skill 状态从 `⏳ Pending` 改为 `✅ Migrated`
   - 补充迁移备注（遇到的特殊问题、手动处理的内容）

2. **将新发现写入本 skill**
   - 如果迁移过程中发现了新的平台差异、工具行为变化或边界情况
   - 将发现补充到 `SKILL.md` 的对应章节（或新增 Common Pitfalls 条目）
   - 确保后续迁移能从本次经验中受益

3. **更新目录**
   - 确认 `/Users/lychee/Documents/configure/pi-skills/migrate-superpower/` 下的文件已反映最新认知
   - 运行 `./install.sh` 部署更新后的 skill

**原则：** 迁移不是一次性搬运，而是持续完善迁移知识库的过程。每次迁移都应让 `migrate-superpower` 变得更准确、更完整。

---

## 12. After Migration

1. Run `./install.sh` to deploy
2. Restart or `/reload` Pi to pick up the new skill
3. Test shell scripts manually to confirm backgrounding behavior
4. Verify skill appears in Pi's skill list
