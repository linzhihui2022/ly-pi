# Migrate from @tintinweb/pi-subagents to pi-subagents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `@tintinweb/pi-subagents` with `pi-subagents@0.27.0`, delete 15 unused historical agent definitions, and rewrite 7 skill files to use the new `subagent()` calling convention.

**Architecture:** Delete all unused custom agent definitions (zero actual invocations), map the single actively-used `general-purpose` type to `pi-subagents` built-ins (`worker` for implementation, `reviewer` for review), and rewrite skill documentation/prompts to use `subagent({ agent: ..., task: ... })` syntax with `tasks` arrays for parallel dispatch and `chain` for sequential workflows.

**Tech Stack:** Pi skills (Markdown with YAML frontmatter), `pi-subagents` npm package, bash for verification.

---

## File Structure

### Agent Definitions (Delete 15)
All files in `pi-agents/` are historical artifacts with zero actual invocations across all skills.

### Skill Files (Modify 9)
| File | Responsibility |
|---|---|
| `pi-skills/migrate-superpower/SKILL.md` | Migration guide — remove §4 agent table, update tool examples |
| `pi-skills/migrate-superpower/skill-mapping.md` | Migration tracker — update cross-skill references |
| `pi-skills/dispatching-parallel-agents/SKILL.md` | Parallel dispatch pattern — XML Agent → `subagent({ tasks: [...] })` |
| `pi-skills/subagent-driven-development/implementer-prompt.md` | Implementer prompt template — `general-purpose` → `worker` |
| `pi-skills/subagent-driven-development/spec-reviewer-prompt.md` | Spec reviewer prompt — `general-purpose` → `reviewer` |
| `pi-skills/subagent-driven-development/code-quality-reviewer-prompt.md` | Quality reviewer prompt — update template reference |
| `pi-skills/brainstorming/spec-document-reviewer-prompt.md` | Spec doc reviewer — `general-purpose` → `reviewer` |
| `pi-skills/requesting-code-review/SKILL.md` | Review workflow — single-step → `chain`: scout → reviewer |
| `pi-skills/requesting-code-review/code-reviewer.md` | Reviewer template — update dispatch syntax |

### Config Files (Delete 1)
| File | Action |
|---|---|
| `.pi/subagents.json` | Delete (tintinweb-specific settings) |

---

### Task 1: Delete 15 Unused Agent Definitions

**Files:**
- Delete: `pi-agents/artifact-code-reviewer.md`
- Delete: `pi-agents/artifact-coverage-reviewer.md`
- Delete: `pi-agents/artifacts-analyzer.md`
- Delete: `pi-agents/artifacts-locator.md`
- Delete: `pi-agents/claim-verifier.md`
- Delete: `pi-agents/codebase-analyzer.md`
- Delete: `pi-agents/codebase-locator.md`
- Delete: `pi-agents/codebase-pattern-finder.md`
- Delete: `pi-agents/diff-auditor.md`
- Delete: `pi-agents/integration-scanner.md`
- Delete: `pi-agents/peer-comparator.md`
- Delete: `pi-agents/precedent-locator.md`
- Delete: `pi-agents/scope-tracer.md`
- Delete: `pi-agents/slice-verifier.md`
- Delete: `pi-agents/web-search-researcher.md`

- [ ] **Step 1: Delete all 15 files**

```bash
cd /Users/lychee/Documents/configure
git rm pi-agents/artifact-code-reviewer.md \
  pi-agents/artifact-coverage-reviewer.md \
  pi-agents/artifacts-analyzer.md \
  pi-agents/artifacts-locator.md \
  pi-agents/claim-verifier.md \
  pi-agents/codebase-analyzer.md \
  pi-agents/codebase-locator.md \
  pi-agents/codebase-pattern-finder.md \
  pi-agents/diff-auditor.md \
  pi-agents/integration-scanner.md \
  pi-agents/peer-comparator.md \
  pi-agents/precedent-locator.md \
  pi-agents/scope-tracer.md \
  pi-agents/slice-verifier.md \
  pi-agents/web-search-researcher.md
```

- [ ] **Step 2: Verify deletion**

Run:
```bash
ls pi-agents/ 2>/dev/null || echo "Directory empty or removed"
find pi-agents/ -name "*.md" -type f 2>/dev/null | wc -l
```

Expected: Directory should be empty or non-existent, `wc -l` should output `0`.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(agents): delete 15 unused historical agent definitions

All had zero actual invocations across all skills. Only
general-purpose was actively used (8 calls across 4 skills).
The other 17 agents were documentation artifacts from an
abandoned skill set."
```

---

### Task 2: Rewrite migrate-superpower/SKILL.md — Remove §4 Agent Table, Update Tool Examples

**Files:**
- Modify: `pi-skills/migrate-superpower/SKILL.md`

This file documents the migration guide itself. §4 currently lists 18 `subagent_type` options (all historical artifacts). §5 documents tintinweb `Agent` tool syntax. Both must be rewritten for `pi-subagents`.

- [ ] **Step 1: Replace §4 Agent/Subagent section**

Replace lines containing the old §4 section (from `## 4. Tool & API Differences` through to `## 5. Pi-Native Tools`).

The old text starts at:
```markdown
## 4. Tool & API Differences
```

And ends just before:
```markdown
## 5. Pi-Native Tools
```

Replace with:

```markdown
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
```

- [ ] **Step 2: Update §5 Agent (Subagent Dispatch) subsection**

Within `## 5. Pi-Native Tools`, find the `### Agent (Subagent Dispatch)` subsection and replace it entirely.

Old text starts at:
```markdown
### Agent (Subagent Dispatch)
```

Replace with:

```markdown
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
```

- [ ] **Step 3: Update §8 verification commands**

Find the verification commands section (## 8. Verification Commands) and add pi-subagents checks.

After the existing checks, add:

```bash
# Check for old tintinweb agent syntax
grep -ri "subagent_type" pi-skills/YOUR-SKILL/ || echo "OK: no subagent_type refs"
grep -ri "run_in_background" pi-skills/YOUR-SKILL/ || echo "OK: no run_in_background refs"
grep -ri "get_subagent_result" pi-skills/YOUR-SKILL/ || echo "OK: no get_subagent_result refs"
grep -ri "steer_subagent" pi-skills/YOUR-SKILL/ || echo "OK: no steer_subagent refs"
```

- [ ] **Step 4: Update §10 Post-Migration Checklist**

Add checklist items:

```markdown
- [ ] `subagent()` uses correct `agent` name (not `subagent_type`)
- [ ] Parallel dispatch uses `tasks` array (not multiple `Agent` calls)
- [ ] Background execution uses `async: true` (not `run_in_background`)
- [ ] Sequential workflows use `chain` array where appropriate
- [ ] No `get_subagent_result` or `steer_subagent` references remain
```

- [ ] **Step 5: Run verification**

```bash
cd /Users/lychee/Documents/configure
grep -n "subagent_type" pi-skills/migrate-superpower/SKILL.md && echo "FAIL" || echo "OK"
grep -n "run_in_background" pi-skills/migrate-superpower/SKILL.md && echo "FAIL" || echo "OK"
grep -n "get_subagent_result" pi-skills/migrate-superpower/SKILL.md && echo "FAIL" || echo "OK"
```

Expected: All outputs `OK`.

- [ ] **Step 6: Commit**

```bash
git add pi-skills/migrate-superpower/SKILL.md
git commit -m "docs(migrate-superpower): update agent/subagent section for pi-subagents

- Remove §4 tintinweb subagent_type table (18 historical artifacts)
- Add pi-subagents built-in agent table (worker, reviewer, scout, etc.)
- Replace Agent XML examples with subagent({...}) syntax
- Add tasks/chain/async/context parameters documentation
- Update verification commands and post-migration checklist"
```

---

### Task 3: Rewrite migrate-superpower/skill-mapping.md — Update Cross-Skill References

**Files:**
- Modify: `pi-skills/migrate-superpower/skill-mapping.md`

- [ ] **Step 1: Update dispatching-parallel-agents migration notes**

Find the row for `dispatching-parallel-agents` in the migration table:

Old:
```markdown
| `dispatching-parallel-agents` | ✅ Migrated | Replaced `Task()` syntax with Pi `Agent` tool + `background: true`. No platform-specific content. |
```

New:
```markdown
| `dispatching-parallel-agents` | ✅ Migrated | Replaced `Task()` syntax with `subagent({ tasks: [...] })` using `worker` agents. No platform-specific content. |
```

- [ ] **Step 2: Update requesting-code-review migration notes**

Old:
```markdown
| `requesting-code-review` | ✅ Migrated | Replaced `Task tool` with `Agent` tool; updated plan path to `.lychee/artifacts/plans/`. |
```

New:
```markdown
| `requesting-code-review` | ✅ Migrated | Replaced `Task tool` with `subagent({ chain: [scout, reviewer] })`; updated plan path to `.lychee/artifacts/plans/`. |
```

- [ ] **Step 3: Commit**

```bash
git add pi-skills/migrate-superpower/skill-mapping.md
git commit -m "docs(migrate-superpower): update skill-mapping for pi-subagents

- Update dispatching-parallel-agents and requesting-code-review
  migration notes to reflect subagent() syntax"
```

---

### Task 4: Rewrite dispatching-parallel-agents/SKILL.md — XML → tasks Array

**Files:**
- Modify: `pi-skills/dispatching-parallel-agents/SKILL.md`

- [ ] **Step 1: Update dispatch example in §3**

Replace the entire "Dispatch in Parallel" subsection (from `### 3. Dispatch in Parallel` through to `### 4. Review and Integrate`).

Old:
```markdown
### 3. Dispatch in Parallel

Use the `Agent` tool with `background: true` to dispatch multiple agents concurrently:

```xml
<!-- Agent 1: Fix abort tests -->
<Agent
  subagent_type="general-purpose"
  description="Fix abort test failures"
  prompt="Fix the 3 failing tests in src/agents/agent-tool-abort.test.ts..."
  background="true"
/>

<!-- Agent 2: Fix batch tests -->
<Agent
  subagent_type="general-purpose"
  description="Fix batch test failures"
  prompt="Fix the 2 failing tests in src/agents/batch-completion-behavior.test.ts..."
  background="true"
/>

<!-- Agent 3: Fix race condition tests -->
<Agent
  subagent_type="general-purpose"
  description="Fix race condition failures"
  prompt="Fix the failing test in src/agents/tool-approval-race-conditions.test.ts..."
  background="true"
/>
```

All three agents run concurrently. You continue with coordination work while they investigate.
```

New:
```markdown
### 3. Dispatch in Parallel

Use `subagent()` with a `tasks` array to dispatch multiple agents concurrently:

```typescript
subagent({
  tasks: [
    {
      agent: "worker",
      task: "Fix the 3 failing tests in src/agents/agent-tool-abort.test.ts...",
      context: "fresh"
    },
    {
      agent: "worker",
      task: "Fix the 2 failing tests in src/agents/batch-completion-behavior.test.ts...",
      context: "fresh"
    },
    {
      agent: "worker",
      task: "Fix the failing test in src/agents/tool-approval-race-conditions.test.ts...",
      context: "fresh"
    }
  ]
})
```

All three agents run concurrently with isolated (`fresh`) context. You continue with coordination work while they investigate.

**Why `context: "fresh"`?** Parallel workers with `fork` (the default for `worker`) would inherit the full parent session, wasting tokens. `fresh` starts each worker with a clean context — you provide exactly what they need in the `task` string.
```

- [ ] **Step 2: Update §4 Review and Integrate**

Replace:
```markdown
### 4. Review and Integrate

When agents return:
- Read each summary
- Verify fixes don't conflict
- Run full test suite
- Integrate all changes
```

With:
```markdown
### 4. Review and Integrate

When the parallel dispatch returns:
- Read each agent's result (returned as aggregated output with separators)
- Verify fixes don't conflict
- Run full test suite
- Integrate all changes

**Note:** `pi-subagents` returns aggregated parallel results with separators, not individual agent results to poll. No need to call `get_subagent_result` for each agent.
```

- [ ] **Step 3: Update §6 Real Example dispatch block**

In the Real Example section, replace the dispatch description:

Old:
```markdown
**Dispatch:**
Agent 1 → Fix agent-tool-abort.test.ts
Agent 2 → Fix batch-completion-behavior.test.ts
Agent 3 → Fix tool-approval-race-conditions.test.ts
```

New:
```markdown
**Dispatch:**
```typescript
subagent({
  tasks: [
    { agent: "worker", task: "Fix agent-tool-abort.test.ts...", context: "fresh" },
    { agent: "worker", task: "Fix batch-completion-behavior.test.ts...", context: "fresh" },
    { agent: "worker", task: "Fix tool-approval-race-conditions.test.ts...", context: "fresh" }
  ]
})
```
```

- [ ] **Step 4: Run verification**

```bash
cd /Users/lychee/Documents/configure
grep -n "subagent_type" pi-skills/dispatching-parallel-agents/SKILL.md && echo "FAIL" || echo "OK"
grep -n "background=" pi-skills/dispatching-parallel-agents/SKILL.md && echo "FAIL" || echo "OK"
grep -n "<Agent" pi-skills/dispatching-parallel-agents/SKILL.md && echo "FAIL" || echo "OK"
```

Expected: All outputs `OK`.

- [ ] **Step 5: Commit**

```bash
git add pi-skills/dispatching-parallel-agents/SKILL.md
git commit -m "docs(dispatching-parallel-agents): migrate to pi-subagents tasks array

- Replace XML Agent + background with subagent({ tasks: [...] })
- Add context: fresh explanation for parallel workers
- Update review section for aggregated results
- Update real example with subagent() syntax"
```

---

### Task 5: Rewrite subagent-driven-development/implementer-prompt.md — general-purpose → worker

**Files:**
- Modify: `pi-skills/subagent-driven-development/implementer-prompt.md`

- [ ] **Step 1: Update agent type reference**

Old:
```markdown
Agent tool (subagent_type: general-purpose):
```

New:
```markdown
Agent tool (subagent: worker):
```

- [ ] **Step 2: Commit**

```bash
git add pi-skills/subagent-driven-development/implementer-prompt.md
git commit -m "docs(subagent-driven-development): implementer uses worker agent

- Map general-purpose → worker (implementation agent)"
```

---

### Task 6: Rewrite subagent-driven-development/spec-reviewer-prompt.md — general-purpose → reviewer

**Files:**
- Modify: `pi-skills/subagent-driven-development/spec-reviewer-prompt.md`

- [ ] **Step 1: Update agent type reference**

Old:
```markdown
Agent tool (subagent_type: general-purpose):
```

New:
```markdown
Agent tool (subagent: reviewer):
```

- [ ] **Step 2: Commit**

```bash
git add pi-skills/subagent-driven-development/spec-reviewer-prompt.md
git commit -m "docs(subagent-driven-development): spec reviewer uses reviewer agent

- Map general-purpose → reviewer (review agent)"
```

---

### Task 7: Rewrite subagent-driven-development/code-quality-reviewer-prompt.md — Update Template Reference

**Files:**
- Modify: `pi-skills/subagent-driven-development/code-quality-reviewer-prompt.md`

- [ ] **Step 1: Update agent reference**

Old:
```markdown
Agent tool (subagent_type: general-purpose):
  Use template at requesting-code-review/code-reviewer.md
```

New:
```markdown
Agent tool (subagent: reviewer):
  Use template at requesting-code-review/code-reviewer.md
```

- [ ] **Step 2: Commit**

```bash
git add pi-skills/subagent-driven-development/code-quality-reviewer-prompt.md
git commit -m "docs(subagent-driven-development): quality reviewer uses reviewer agent

- Map general-purpose → reviewer (review agent)"
```

---

### Task 8: Rewrite brainstorming/spec-document-reviewer-prompt.md — general-purpose → reviewer

**Files:**
- Modify: `pi-skills/brainstorming/spec-document-reviewer-prompt.md`

- [ ] **Step 1: Update agent type reference**

Old:
```markdown
Agent tool (subagent_type="general-purpose"):
```

New:
```markdown
Agent tool (subagent: reviewer):
```

- [ ] **Step 2: Commit**

```bash
git add pi-skills/brainstorming/spec-document-reviewer-prompt.md
git commit -m "docs(brainstorming): spec doc reviewer uses reviewer agent

- Map general-purpose → reviewer (review agent)"
```

---

### Task 9: Rewrite requesting-code-review/SKILL.md — Single-Step → scout → reviewer Chain

**Files:**
- Modify: `pi-skills/requesting-code-review/SKILL.md`

- [ ] **Step 1: Update §2 dispatch instructions**

Replace:
```markdown
**2. Dispatch code reviewer subagent:**

Use `Agent` tool with `general-purpose` type, fill template at `code-reviewer.md`

**Placeholders:**
- `{DESCRIPTION}` - Brief summary of what you built
- `{PLAN_OR_REQUIREMENTS}` - What it should do
- `{BASE_SHA}` - Starting commit
- `{HEAD_SHA}` - Ending commit
```

With:
```markdown
**2. Dispatch code reviewer subagent:**

Use `subagent()` with a `chain` to first gather the diff, then review it:

```typescript
subagent({
  chain: [
    {
      agent: "scout",
      task: `Get the git diff from ${BASE_SHA} to ${HEAD_SHA} and write it to diff.txt`,
      output: "diff.txt"
    },
    {
      agent: "reviewer",
      task: `Review the code diff in diff.txt.\n\nDescription: ${DESCRIPTION}\n\nPlan/Requirements: ${PLAN_OR_REQUIREMENTS}`,
      reads: "diff.txt"
    }
  ]
})
```

**Placeholders:**
- `{DESCRIPTION}` - Brief summary of what you built
- `{PLAN_OR_REQUIREMENTS}` - What it should do
- `{BASE_SHA}` - Starting commit
- `{HEAD_SHA}` - Ending commit
```

- [ ] **Step 2: Update example section**

Replace:
```markdown
[Dispatch code reviewer subagent]
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types
  PLAN_OR_REQUIREMENTS: Task 2 from .lychee/artifacts/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661
```

With:
```markdown
[Dispatch code reviewer chain]
```typescript
subagent({
  chain: [
    {
      agent: "scout",
      task: "Get the git diff from a7981ec to 3df7661 and write it to diff.txt",
      output: "diff.txt"
    },
    {
      agent: "reviewer",
      task: "Review the code diff in diff.txt.\n\nDescription: Added verifyIndex() and repairIndex() with 4 issue types\n\nPlan/Requirements: Task 2 from .lychee/artifacts/plans/deployment-plan.md",
      reads: "diff.txt"
    }
  ]
})
```
```

- [ ] **Step 3: Run verification**

```bash
cd /Users/lychee/Documents/configure
grep -n "subagent_type" pi-skills/requesting-code-review/SKILL.md && echo "FAIL" || echo "OK"
grep -n "general-purpose" pi-skills/requesting-code-review/SKILL.md && echo "FAIL" || echo "OK"
```

Expected: All outputs `OK`.

- [ ] **Step 4: Commit**

```bash
git add pi-skills/requesting-code-review/SKILL.md
git commit -m "docs(requesting-code-review): migrate to pi-subagents chain

- Replace single-step Agent dispatch with scout → reviewer chain
- scout gathers diff, reviewer analyzes it
- Update example with subagent({ chain: [...] }) syntax"
```

---

### Task 10: Rewrite requesting-code-review/code-reviewer.md — Update Dispatch Syntax

**Files:**
- Modify: `pi-skills/requesting-code-review/code-reviewer.md`

- [ ] **Step 1: Update agent reference**

Old:
```markdown
Agent tool (general-purpose):
```

New:
```markdown
Agent tool (reviewer):
```

- [ ] **Step 2: Update git diff commands section**

In the prompt template, the reviewer currently runs git diff commands directly. With the chain approach, the diff is already provided in `diff.txt`. Update the instructions.

Find:
```markdown
    ## Git Range to Review

    **Base:** {BASE_SHA}
    **Head:** {HEAD_SHA}

    ```bash
    git diff --stat {BASE_SHA}..{HEAD_SHA}
    git diff {BASE_SHA}..{HEAD_SHA}
    ```
```

Replace with:
```markdown
    ## Diff to Review

    The git diff from {BASE_SHA} to {HEAD_SHA} is provided below (or in the attached diff.txt).

    ```bash
    git diff --stat {BASE_SHA}..{HEAD_SHA}
    ```

    Review the full diff for code quality, plan alignment, and correctness.
```

- [ ] **Step 3: Run verification**

```bash
cd /Users/lychee/Documents/configure
grep -n "general-purpose" pi-skills/requesting-code-review/code-reviewer.md && echo "FAIL" || echo "OK"
```

Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add pi-skills/requesting-code-review/code-reviewer.md
git commit -m "docs(requesting-code-review): update reviewer template for pi-subagents

- Map general-purpose → reviewer
- Update diff instructions for chain-provided diff"
```

---

### Task 11: Global Configuration Cleanup

**Files:**
- Delete: `.pi/subagents.json` (if exists)

- [ ] **Step 1: Check for and remove tintinweb config**

```bash
cd /Users/lychee/Documents/configure
if [ -f .pi/subagents.json ]; then
  git rm .pi/subagents.json
  git commit -m "chore(config): remove tintinweb-specific subagents.json

Settings (maxConcurrent, graceTurns, defaultJoinMode, etc.)
do not apply to pi-subagents."
else
  echo "No .pi/subagents.json found — skipping"
fi
```

- [ ] **Step 2: Run install.sh to sync global agents**

```bash
cd /Users/lychee/Documents/configure
./install.sh
```

Expected: Completes without errors. Stale agent definitions removed from `~/.pi/agent/agents/`.

- [ ] **Step 3: Uninstall tintinweb package**

```bash
pi uninstall npm:@tintinweb/pi-subagents
```

Expected: Package removed successfully.

- [ ] **Step 4: Install pi-subagents (if not already)**

```bash
pi install npm:pi-subagents
```

Expected: Package installs successfully.

---

### Task 12: Global Verification

- [ ] **Step 1: Static checks — no lingering tintinweb references**

```bash
cd /Users/lychee/Documents/configure

echo "=== Check 1: subagent_type ==="
grep -rn "subagent_type" pi-skills/ pi-agents/ .pi/ 2>/dev/null && echo "FAIL" || echo "OK"

echo "=== Check 2: run_in_background ==="
grep -rn "run_in_background" pi-skills/ pi-agents/ .pi/ 2>/dev/null && echo "FAIL" || echo "OK"

echo "=== Check 3: get_subagent_result ==="
grep -rn "get_subagent_result" pi-skills/ pi-agents/ .pi/ 2>/dev/null && echo "FAIL" || echo "OK"

echo "=== Check 4: steer_subagent ==="
grep -rn "steer_subagent" pi-skills/ pi-agents/ .pi/ 2>/dev/null && echo "FAIL" || echo "OK"

echo "=== Check 5: tintinweb package ==="
grep -rn "@tintinweb/pi-subagents" pi-skills/ pi-agents/ .pi/ 2>/dev/null && echo "FAIL" || echo "OK"

echo "=== Check 6: XML Agent tags ==="
grep -rn "<Agent" pi-skills/ pi-agents/ .pi/ 2>/dev/null | grep -v "agent tool\|agent: " && echo "FAIL" || echo "OK"
```

Expected: All checks print `OK`.

- [ ] **Step 2: Verify pi-subagents is installed**

```bash
pi list | grep pi-subagents
```

Expected: Output contains `npm:pi-subagents` and does NOT contain `@tintinweb/pi-subagents`.

- [ ] **Step 3: Verify built-in agents are discoverable**

```bash
pi list | grep -E "worker|reviewer|scout|planner"
```

Expected: Output contains built-in agent names.

- [ ] **Step 4: Commit final verification state**

```bash
git add -A
git commit -m "feat(subagents): complete migration to pi-subagents

- Delete 15 unused historical agent definitions
- Rewrite 7 skill files with subagent() syntax
- Replace Agent XML with subagent({ tasks: [...] })
- Replace single-step review with scout → reviewer chain
- Map general-purpose → worker (implementation) / reviewer (review)
- Remove .pi/subagents.json (tintinweb-specific)
- Uninstall @tintinweb/pi-subagents, install pi-subagents"
```

---

## Self-Review

### 1. Spec Coverage

| Design Requirement | Task |
|---|---|
| Replace `@tintinweb/pi-subagents` with `pi-subagents` | Task 11 (install/uninstall) |
| Delete 15 unused agent definitions | Task 1 |
| Rewrite `migrate-superpower/SKILL.md` §4 | Task 2 |
| Rewrite `migrate-superpower/skill-mapping.md` | Task 3 |
| Rewrite `dispatching-parallel-agents/SKILL.md` | Task 4 |
| Rewrite `subagent-driven-development/` prompts (3 files) | Tasks 5-7 |
| Rewrite `brainstorming/spec-document-reviewer-prompt.md` | Task 8 |
| Rewrite `requesting-code-review/SKILL.md` | Task 9 |
| Rewrite `requesting-code-review/code-reviewer.md` | Task 10 |
| Remove `.pi/subagents.json` | Task 11 |
| Preserve parallel dispatch behavior | Task 4 (tasks array) |
| Preserve background execution | Task 4 (async equivalent via parallel tasks) |
| Add chains where appropriate | Task 9 (scout → reviewer) |
| Global verification | Task 12 |

**No gaps identified.**

### 2. Placeholder Scan

- No "TBD", "TODO", "implement later", "fill in details"
- No "Add appropriate error handling" / "add validation" / "handle edge cases"
- No "Write tests for the above" without test code (this is doc migration, tests are grep checks)
- No "Similar to Task N" references
- All steps show exact code or exact commands

### 3. Type Consistency

- `agent: "worker"` used consistently for implementation tasks
- `agent: "reviewer"` used consistently for review tasks
- `agent: "scout"` used for read-only reconnaissance
- `context: "fresh"` used consistently for parallel workers
- `tasks` array used for parallel dispatch
- `chain` array used for sequential workflows

No inconsistencies found.

---

## Execution Handoff

**Plan complete and saved to `.lychee/artifacts/plans/2026-06-03-migrate-to-pi-subagents.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. REQUIRED SUB-SKILL: `subagent-driven-development`.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints for review.

**Which approach?**
