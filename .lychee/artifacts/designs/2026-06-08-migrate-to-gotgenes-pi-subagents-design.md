# Migrate from pi-subagents to @gotgenes/pi-subagents

## Context

Current setup uses `pi-subagents@0.28.0` (nicobailon, workflow orchestration engine) with
`@gotgenes/pi-permission-system@10.3.0`. The two packages are incompatible:
pi-subagents (nicobailon) sub-agents do not emit `<active_agent>` tags, so
permission-system cannot distinguish them from the parent agent and blocks their
actions entirely.

Target is `@gotgenes/pi-subagents@14.0.0` (friendly fork of tintinweb), which
integrates natively with permission-system via `<active_agent>` tags and
`permission:` frontmatter.

This migration is **not** a drop-in replacement. The two packages have
completely different calling conventions, agent configuration models, and
dispatch patterns. Skills currently written for nicobailon's `subagent({ agent:
"worker", task: "..." })` syntax must be rewritten for gotgenes'
`subagent({ subagent_type: "worker", prompt: "...", description: "..." })` syntax.

## Goals

1. Replace `pi-subagents` (nicobailon) with `@gotgenes/pi-subagents`
2. Create 8 custom agent definitions in `pi-agents/` to replace nicobailon's
   built-in agents (worker, reviewer, scout, planner, oracle, delegate,
   researcher, context-builder)
3. Rewrite all 9 skill files that reference subagents to use gotgenes calling
   conventions
4. Preserve behavior: parallel dispatch via multiple `run_in_background` calls,
   sequential workflows via step-by-step independent calls
5. Enable permission-system integration — permission rules now apply correctly
   to sub-agent actions

## Non-Goals

- Do NOT change agent roles or add new agent types beyond the 8 needed for
  compatibility
- Do NOT change unrelated skills that do not dispatch subagents
- Do NOT migrate `pi-extensions` or `pi-themes`
- Do NOT modify `@gotgenes/pi-permission-system` configuration

---

## Compatibility Matrix: nicobailon → gotgenes

### Agent Model

| nicobailon | gotgenes |
|---|---|
| Built-in agents provided by the package (8 types) | Custom agents defined via `.pi/agents/<name>.md` files with YAML frontmatter |
| `agent: "worker"` parameter | `subagent_type: "worker"` parameter |
| Agent types: worker, reviewer, scout, planner, oracle, delegate, researcher, context-builder | Default types: general-purpose, Explore, Plan. All others must be created as custom agents. |

### Calling Convention

| nicobailon | gotgenes |
|---|---|
| `subagent({ agent: "worker", task: "..." })` | `subagent({ subagent_type: "worker", prompt: "...", description: "..." })` |
| `subagent({ tasks: [{ agent, task }, ...] })` | Multiple `subagent({ ..., run_in_background: true })` calls |
| `subagent({ chain: [{ agent, task }, ...] })` | Step-by-step independent calls; feed output manually |
| `async: true` | `run_in_background: true` |
| `context: "fresh"` / `context: "fork"` | `inherit_context: true` (fork) or omit (fresh) |
| `subagent({ action: "status", id: "..." })` | `get_subagent_result({ agent_id: "..." })` |
| `subagent({ action: "interrupt", id: "..." })` | `steer_subagent({ agent_id: "...", message: "..." })` |
| `output: "file.txt"`, `reads: "file.txt"` | Not supported; pass content inline in `prompt` |
| `acceptance` contracts | Not supported |

---

## Custom Agent Definitions (8 files)

All agent files live in `pi-agents/` and are deployed to `~/.pi/agent/agents/`
via `pi-agents/scripts/deploy.ts`.

### worker (`pi-agents/worker.md`)

- **Role:** Implementation agent (write, edit, fix code)
- **Tools:** All 7 (read, bash, edit, write, grep, find, ls)
- **Prompt mode:** `append` — inherits parent's AGENTS.md and project conventions
- **Model/thinking:** Inherit from parent

### reviewer (`pi-agents/reviewer.md`)

- **Role:** Read-only code/spec reviewer
- **Tools:** Read-only (read, bash, grep, find, ls)
- **Prompt mode:** `replace` — standalone review prompt with structured output format
- **Thinking:** `medium` — review requires depth

### scout (`pi-agents/scout.md`)

- **Role:** Fast read-only reconnaissance
- **Tools:** Read-only (read, bash, grep, find, ls)
- **Prompt mode:** `replace`
- **Model:** `haiku` — fast, low-cost (falls back to inherit if not available)

### planner (`pi-agents/planner.md`)

- **Role:** Design and architecture planning
- **Tools:** Read-only (read, bash, grep, find, ls)
- **Prompt mode:** `replace`
- **Thinking:** `high` — planning requires broad reasoning

### oracle (`pi-agents/oracle.md`)

- **Role:** Deep reasoning and second opinions
- **Tools:** Read-only (read, bash, grep, find, ls)
- **Prompt mode:** `replace`
- **Thinking:** `high`
- **Model:** Inherit (or explicit high-capability model)

### delegate (`pi-agents/delegate.md`)

- **Role:** Lightweight general-purpose agent for simple tasks
- **Tools:** All 7
- **Prompt mode:** `append` — parent twin, inherits conventions
- **Model/thinking:** Inherit

### researcher (`pi-agents/researcher.md`)

- **Role:** Web research specialist
- **Tools:** Read, grep, find, ls (+ web tools via extensions)
- **Prompt mode:** `replace`
- **Extensions:** `true` — needs web access MCP tools

### context-builder (`pi-agents/context-builder.md`)

- **Role:** Context preparation and summarization
- **Tools:** Read-only (read, grep, find, ls)
- **Prompt mode:** `replace`
- **Model:** Inherit

---

## Skill File Rewrites (9 files)

### 1. `dispatching-parallel-agents/SKILL.md` (high impact)

Changes:
- `subagent({ tasks: [...] })` → multiple `subagent({ ..., run_in_background: true })` calls
- `context: "fresh"` → no equivalent; agents start fresh by default in gotgenes
- `subagent({ action: "status" })` → `get_subagent_result({ agent_id: "..." })`
- Remove references to aggregated parallel results

### 2. `requesting-code-review/SKILL.md`

Changes:
- `subagent({ chain: [scout, reviewer] })` → two independent `subagent()` calls
- Step 1: scout gathers diff via `subagent({ subagent_type: "scout", ... })`
- Step 2: reviewer reviews the collected diff

### 3. `requesting-code-review/code-reviewer.md`

Changes:
- Agent reference: general-purpose → reviewer
- Diff gathering instructions updated for manual two-step workflow

### 4-7. Prompt templates (4 files)

Simple agent name + syntax replacement in:
- `subagent-driven-development/implementer-prompt.md`: `agent: "worker"` → `subagent_type: "worker"`
- `subagent-driven-development/spec-reviewer-prompt.md`: `agent: "reviewer"` → `subagent_type: "reviewer"`
- `subagent-driven-development/code-quality-reviewer-prompt.md`: same
- `brainstorming/spec-document-reviewer-prompt.md`: same

### 8-9. `migrate-superpower/SKILL.md` and `skill-mapping.md`

Update the migration guide to document the gotgenes calling convention:
- Agent table: replace nicobailon built-ins with gotgenes custom agent types
- Syntax examples: `agent: "worker"` → `subagent_type: "worker"`
- Parallel: `tasks` array → multiple `run_in_background` calls
- Background: `async` → `run_in_background`
- Verification commands updated for gotgenes patterns

---

## Installation Steps

1. `pi install npm:@gotgenes/pi-subagents`
2. `pi uninstall npm:pi-subagents`
3. Deploy custom agents: `cd pi-agents && bun run scripts/deploy.ts`
4. `/reload` in pi session
5. Clean up nicobailon artifacts: `rm -rf ~/.pi/agent/extensions/subagent/`

---

## Verification

### Static

```bash
# No nicobailon-specific patterns remain
grep -rn 'context.*fresh\|tasks:.*\[|chain:.*\[' pi-skills/ && echo "FAIL" || echo "OK"
grep -rn 'subagent({ agent: ' pi-skills/ && echo "FAIL" || echo "OK"

# All agent files have valid frontmatter
for f in pi-agents/*.md; do
  head -1 "$f" | grep -q "^---$" || echo "MISSING: $f"
done

# No tintinweb legacy
grep -rn 'subagent_type.*general-purpose' pi-skills/ && echo "FAIL" || echo "OK"
```

### Dynamic

1. `pi list` shows `@gotgenes/pi-subagents`, NOT `pi-subagents`
2. `/agents` menu shows all 8 custom agent types
3. Permission-system correctly identifies sub-agent identity
4. Smoke test: dispatch a simple worker and reviewer

---

## Rollback Plan

```bash
pi uninstall npm:@gotgenes/pi-subagents
pi install npm:pi-subagents
git checkout -- pi-agents/ pi-skills/
./install.sh
```

---

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Create 8 custom agents vs. use general-purpose | Need precise tool/model/thinking control per role; permission-system can differentiate by agent type |
| 2 | Separate calls for parallel/chain | Native gotgenes approach; no need for abstraction layer |
| 3 | Worker uses `append` mode (parent twin) | Worker needs to follow same project conventions as parent |
| 4 | Reviewer/scout/planner/oracle use `replace` mode | Standalone roles with specialized prompts |
| 5 | Scout uses haiku model | Minimizes cost for fast read-only tasks |
