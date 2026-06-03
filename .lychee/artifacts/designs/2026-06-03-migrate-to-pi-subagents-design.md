# Migrate from @tintinweb/pi-subagents to pi-subagents (nicobailon)

## Context

Current setup uses `@tintinweb/pi-subagents` (Claude Code-style single-agent dispatch with Widget UI, scheduling, steering). Target is `pi-subagents@0.27.0` (workflow orchestration engine with chains, parallel groups, dynamic fanout, acceptance gates).

This migration is **not** a drop-in replacement. The two packages have different calling conventions, frontmatter schemas, and conceptual models. The goal is to switch fully to `pi-subagents` while rewriting 7 skill workflows and removing 15 unused custom agent definitions (only `general-purpose` was actively used; the other 17 were historical artifacts from an abandoned skill set).

---

## Goals

1. Replace `@tintinweb/pi-subagents` with `pi-subagents` in `pi list`
2. **Delete 15 unused custom agent definitions** (historical artifacts)
3. Rewrite all skill files that dispatch subagents to use `pi-subagents` calling conventions
4. Preserve behavior: parallel dispatch, background execution
5. Add `pi-subagents`-native capabilities where they improve existing workflows (chains, review loops)

---

## Non-Goals

- Do NOT redesign agent roles or add new agent types beyond what's needed for compatibility
- Do NOT migrate to `@gotgenes/pi-subagents` (friendly fork of tintinweb) — this plan targets the orthogonal nicobailon implementation
- Do NOT change unrelated skills that do not dispatch subagents
- Do NOT migrate `pi-extensions` or `pi-themes`

---

## Compatibility Matrix: tintinweb → pi-subagents

### Frontmatter Fields

| tintinweb Field | pi-subagents Equivalent | Action |
|---|---|---|
| `name` | `name` | Keep as-is |
| `description` | `description` | Keep as-is |
| `tools` | `tools` | Rewrite: remove `ext:` prefix, use `mcp:` for MCP tools, `subagent` for nested dispatch |
| `isolated` | `extensions: ""` | Replace `isolated: true` with `extensions:` (empty = no extensions) |
| `model` | `model` | Keep; bare IDs prefer current provider in pi-subagents (same behavior) |
| `thinking` | `thinking` | Keep as-is |
| `max_turns` | N/A | Remove; pi-subagents has no per-agent turn limit |
| — | `fallbackModels` | Add for critical agents (reviewer, worker) |
| — | `completionGuard` | Add `completionGuard: false` for all read-only agents to prevent false "implementation" detection |
| — | `maxSubagentDepth` | Add `maxSubagentDepth: 1` for agents that need nested fanout |
| — | `systemPromptMode` | Default `replace`; `delegate` agent needs `append` |
| — | `inheritProjectContext` | Default `false` (custom agents start clean); set `true` if agent needs AGENTS.md |
| — | `defaultContext` | Default `fresh`; `planner`/`worker`/`oracle` in pi-subagents default to `fork` |

### Tool Calling Conventions

| tintinweb Pattern | pi-subagents Replacement |
|---|---|
| `Agent({ subagent_type: "X", prompt: "...", run_in_background: true })` | `subagent({ agent: "X", task: "...", async: true })` |
| `get_subagent_result(agent_id)` | `subagent({ action: "status", id: "..." })` |
| `steer_subagent(agent_id, message)` | `subagent({ action: "interrupt", id: "..." })` or `subagent({ action: "resume", id: "...", message: "..." })` |
| Parallel background agents (3× Agent with background) | `subagent({ tasks: [{ agent: "X", task: "..." }, { agent: "Y", task: "..." }] })` |
| Sequential agents (chain) | `subagent({ chain: [{ agent: "X", task: "..." }, { agent: "Y", task: "..." }] })` |

### Agent Type Mapping

**Utilization audit result:** Only `general-purpose` was actively dispatched (8 actual calls across 4 skills). The other 17 agents were only listed in `migrate-superpower/SKILL.md` §4 as documentation options, with zero actual invocations. They are historical artifacts from an abandoned skill set.

| tintinweb `subagent_type` | pi-subagents `agent` | Utilization | Decision |
|---|---|---|---|
| `general-purpose` | **`worker`** (implementation) / **`reviewer`** (review) | 8 actual calls | **Map to built-in** |
| `Explore` | N/A | 0 calls | **Delete** |
| `Plan` | N/A | 0 calls | **Delete** |
| `codebase-analyzer` | N/A | 0 calls | **Delete** |
| `codebase-locator` | N/A | 0 calls | **Delete** |
| `codebase-pattern-finder` | N/A | 0 calls | **Delete** |
| `integration-scanner` | N/A | 0 calls | **Delete** |
| `peer-comparator` | N/A | 0 calls | **Delete** |
| `precedent-locator` | N/A | 0 calls | **Delete** |
| `scope-tracer` | N/A | 0 calls | **Delete** |
| `slice-verifier` | N/A | 0 calls | **Delete** |
| `artifact-code-reviewer` | N/A | 0 calls | **Delete** |
| `artifact-coverage-reviewer` | N/A | 0 calls | **Delete** |
| `artifacts-analyzer` | N/A | 0 calls | **Delete** |
| `artifacts-locator` | N/A | 0 calls | **Delete** |
| `diff-auditor` | N/A | 0 calls | **Delete** |
| `claim-verifier` | N/A | 0 calls | **Delete** |
| `web-search-researcher` | **`researcher`** (built-in) | 0 calls (listed only) | **Map to built-in** (install `pi-web-access`) |

**Mapping rules by role:**
- **Implementation tasks** (fix tests, implement task, execute plan) → `worker`
- **Review tasks** (spec compliance, code quality, PR review) → `reviewer`
- **Parallel dispatch** (multiple independent tasks) → `tasks` array with `worker`
- **Review chain** (get diff → review) → `chain` with `scout` → `reviewer`
- **Review loops** (implementer → reviewer → fix → re-review) → **separate subagent calls** with conditional loops (pi-subagents chain does not support branching/looping)

---

## Phase 0: Preparation

### 0.1 Create Branch
```bash
git checkout -b migrate/pi-subagents
```

### 0.2 Install pi-subagents (side-by-side test)
```bash
pi install npm:pi-subagents
```
Verify both packages appear in `pi list` temporarily.

### 0.3 Audit Current State
- [ ] Run `grep -rn "subagent_type" pi-skills/ pi-agents/` → produce exact file:line list
- [ ] Run `grep -rn "Agent(" pi-skills/` → produce exact file:line list
- [ ] Run `grep -rn "get_subagent_result\|steer_subagent" pi-skills/` → produce exact file:line list
- [ ] Document current `.pi/subagents.json` tintinweb settings for reference

### 0.4 Decision: Keep or Drop tintinweb?
**Decision:** Drop tintinweb after Phase 4 verification passes. Do not dual-run in production.

---

## Phase 1: Delete Unused Agent Definitions

### 1.1 Delete 15 Historical Agent Files

These agents had zero actual invocations across all skills. They were listed only in `migrate-superpower/SKILL.md` §4 as documentation options, inherited from an abandoned skill set.

```bash
git rm pi-agents/artifact-code-reviewer.md
pi-agents/artifact-coverage-reviewer.md
pi-agents/artifacts-analyzer.md
pi-agents/artifacts-locator.md
pi-agents/claim-verifier.md
pi-agents/codebase-analyzer.md
pi-agents/codebase-locator.md
pi-agents/codebase-pattern-finder.md
pi-agents/diff-auditor.md
pi-agents/integration-scanner.md
pi-agents/peer-comparator.md
pi-agents/precedent-locator.md
pi-agents/scope-tracer.md
pi-agents/slice-verifier.md
pi-agents/web-search-researcher.md
```

### 1.2 Keep `pi-agents/` Directory

If the directory is empty after deletion, add a `.gitkeep`:
```bash
touch pi-agents/.gitkeep
git add pi-agents/.gitkeep
```

Future custom agents can be added here as needed.

### 1.3 Verification
```bash
# Directory should be empty or contain only .gitkeep
ls pi-agents/

# No remaining .md files except .gitkeep
find pi-agents/ -name "*.md" -type f | wc -l  # should be 0
```

---

## Phase 2: Skills Rewrite

### 2.1 `migrate-superpower/SKILL.md`

This is the migration guide itself. It currently documents tintinweb conventions. Rewrite §4 (Agent/Subagent) and §5 (Pi-Native Tools).

**Changes:**
- Remove §4 `subagent_type` selection table entirely (all 18 listed types were historical artifacts; only `general-purpose` was actually used)
- Add concise `agent` selection table with only the types that matter: `worker` (implementation), `reviewer` (review), `scout` (recon), `planner` (planning), `researcher` (web research), `delegate` (lightweight general)
- Replace `Agent({ subagent_type: ... })` examples with `subagent({ agent: ... })`
- Replace `get_subagent_result` / `steer_subagent` with `subagent({ action: ... })`
- Update `run_in_background: true` → `async: true`
- Add `pi-subagents` specific parameters: `tasks`, `chain`, `async`, `context`, `output`, `outputMode`
- Update verification commands (grep checks)

### 2.2 `migrate-superpower/skill-mapping.md`

Update the mapping table to reflect new tool conventions.

### 2.3 `dispatching-parallel-agents/SKILL.md`

**This is the highest-impact rewrite.** The entire pattern changes from "dispatch 3 background agents and poll" to "submit a `tasks` array."

**Before:**
```xml
<Agent subagent_type="general-purpose" description="Fix abort" prompt="..." background="true" />
<Agent subagent_type="general-purpose" description="Fix batch" prompt="..." background="true" />
<Agent subagent_type="general-purpose" description="Fix race" prompt="..." background="true" />
```

**After:**
```ts
subagent({
  tasks: [
    { agent: "worker", task: "Fix the 3 failing tests in src/agents/agent-tool-abort.test.ts...", context: "fresh" },
    { agent: "worker", task: "Fix the 2 failing tests in src/agents/batch-completion-behavior.test.ts...", context: "fresh" },
    { agent: "worker", task: "Fix the failing test in src/agents/tool-approval-race-conditions.test.ts...", context: "fresh" }
  ]
})
```

**Rationale:** `worker` is pi-subagents' implementation agent with edit/write/bash tools. `context: "fresh"` prevents parallel workers from forking the full parent session (saves tokens).

Also update the "Review and Integrate" section: pi-subagents returns aggregated parallel results with separators, not individual agent results to poll.

### 2.4 `subagent-driven-development/` Prompts

Three files reference `Agent` tool. These are prompt templates injected into agent system prompts.

| File | Role | Old | New |
|---|---|---|---|
| `implementer-prompt.md` | Implementation | `Agent({ subagent_type: "general-purpose" })` | `subagent({ agent: "worker", task: "..." })` |
| `spec-reviewer-prompt.md` | Spec compliance review | `Agent({ subagent_type: "general-purpose" })` | `subagent({ agent: "reviewer", task: "..." })` |
| `code-quality-reviewer-prompt.md` | Code quality review | `Agent({ subagent_type: "general-purpose" })` | `subagent({ agent: "reviewer", task: "..." })` |

**Review loop note:** pi-subagents `chain` does not support conditional branching or looping. The implementer → reviewer → fix → re-review loop must be expressed as **separate sequential subagent calls** with the parent agent evaluating reviewer output and deciding whether to loop. Update the skill's flowchart text accordingly.

**Output format risk:** pi-subagents `reviewer` outputs `## Review` → Correct/Fixed/Blocker/Note structure. Your current prompt templates may expect a different format. Add explicit format instructions in the `task` string if needed.

### 2.5 `brainstorming/spec-document-reviewer-prompt.md`

**Role:** Spec document review.

**Change:** `Agent({ subagent_type: "general-purpose" ... })` → `subagent({ agent: "reviewer", task: "..." })`

### 2.6 `requesting-code-review/SKILL.md` and `code-reviewer.md`

**Role:** PR / code diff review.

**Decision:** Convert from single-step review to a **chain**: first `scout` gets the git diff, then `reviewer` reviews it.

**Before:**
```xml
<Agent subagent_type="general-purpose" description="Review changes"
  prompt="Review the changes from BASE_SHA to HEAD_SHA..."
/>
```

**After:**
```ts
subagent({
  chain: [
    {
      agent: "scout",
      task: "Get the git diff from BASE_SHA to HEAD_SHA and write it to diff.txt",
      output: "diff.txt"
    },
    {
      agent: "reviewer",
      task: "Review the code diff in diff.txt. Description: {DESCRIPTION}. Plan: {PLAN_OR_REQUIREMENTS}",
      reads: "diff.txt"
    }
  ]
})
```

### 2.7 Verification
```bash
grep -rn "subagent_type" pi-skills/ && echo "FAIL" || echo "OK"
grep -rn "get_subagent_result\|steer_subagent" pi-skills/ && echo "FAIL" || echo "OK"
grep -rn "run_in_background" pi-skills/ && echo "FAIL" || echo "OK"
grep -rn "Agent(" pi-skills/ | grep -v "agent\|general" && echo "FAIL" || echo "OK"
```

---

## Phase 3: Global Configuration

### 3.1 Remove tintinweb Settings

```bash
rm .pi/subagents.json
```

This file contains tintinweb-specific settings (`maxConcurrent`, `graceTurns`, `defaultJoinMode`, `schedulingEnabled`, `scopeModels`) that do not apply to pi-subagents.

### 3.2 Add pi-subagents Settings (Optional)

If desired, create `.pi/extensions/subagent/config.json`:
```json
{
  "parallel": {
    "maxTasks": 12,
    "concurrency": 6
  },
  "maxSubagentDepth": 2,
  "defaultSessionDir": "~/.pi/agent/sessions/subagent/"
}
```

### 3.3 Global Agent Deployment

`pi-agents/` is now empty (all historical agents deleted). Run `./install.sh` to sync:
```bash
./install.sh
```
This will remove stale agent definitions from `~/.pi/agent/agents/` and ensure the directory is clean.

### 3.4 Uninstall tintinweb

```bash
pi uninstall npm:@tintinweb/pi-subagents
```

---

## Phase 4: Verification & Testing

### 4.1 Static Checks
```bash
# No lingering tintinweb references
grep -rn "@tintinweb/pi-subagents" pi-skills/ pi-agents/ .pi/ && echo "FAIL" || echo "OK"

# All agent frontmatters valid
cat pi-agents/*.md | grep -c "^---"  # should be even (open+close per file)

# install.sh succeeds
./install.sh
```

### 4.2 Live Smoke Test

1. Start a fresh Pi session
2. Verify `pi list` shows `npm:pi-subagents` and NOT `@tintinweb/pi-subagents`
3. Run a simple subagent:
   ```
   /run scout "List all markdown files in the current directory"
   ```
4. Run a parallel test:
   ```
   /parallel scout "find all .ts files" -> reviewer "check for any issues"
   ```
5. Verify built-in agents are discoverable:
   ```
   subagent({ action: "list" })
   ```
   Should show `worker`, `reviewer`, `scout`, `planner`, `researcher`, `delegate`, `oracle`, `context-builder`.

### 4.3 Skill Invocation Test

Test each rewritten skill in a throwaway session:
- `dispatching-parallel-agents`: Dispatch 2 parallel `scout` agents on a trivial task
- `subagent-driven-development`: Verify the prompt templates render correctly

### 4.4 Researcher Agent Test (Optional)

If `pi-web-access` was installed:
```
subagent({ agent: "researcher", task: "What is the latest version of TypeScript?" })
```
If this fails, check that `pi-web-access` extension is loaded and the agent has `mcp:` tool access.

---

## Phase 5: Cleanup & Merge

### 5.1 Commit
```bash
git add pi-agents/ pi-skills/ .pi/
git commit -m "feat(subagents): migrate from @tintinweb/pi-subagents to pi-subagents

- Delete 15 unused historical agent definitions (zero actual invocations)
- Map general-purpose to pi-subagents built-ins: worker (implementation), reviewer (review)
- Rewrite 7 skill files to use subagent() calling convention
- dispatching-parallel-agents: XML background agents -> tasks array with worker
- subagent-driven-development: reviewer loop -> sequential subagent calls
- requesting-code-review: single-step -> scout -> reviewer chain
- Remove .pi/subagents.json (tintinweb-specific)
- Update migrate-superpower guide for pi-subagents conventions"
```

### 5.2 Merge Options
- **Fast-path:** Direct merge to `main` if verification passes cleanly
- **Safe-path:** Open PR, test for a few days, then merge

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `reviewer` output format incompatible with existing parser | Medium | High | Add explicit format instructions in `task` string; fallback: create custom reviewer agent if needed |
| `dispatching-parallel-agents` skill semantics drift (polling vs aggregated results) | Medium | High | Rewrite the "Review and Integrate" section carefully; test with real parallel dispatch |
| `worker` default `fork` context duplicates parent session (token cost) | Low | Medium | Explicit `context: "fresh"` in parallel worker tasks |
| Global agents (`~/.pi/agent/agents/`) out of sync with repo | Medium | Medium | `./install.sh` in Phase 3.3 removes stale definitions |
| User forgets to uninstall tintinweb → tool name collision | Medium | High | Phase 3.4 uninstall step; `pi list` verification in Phase 4.2 |
| `pi-web-access` not installed → `researcher` agent fails | Low | Low | `researcher` is not actively used; install if needed later |

---

## Rollback Plan

If verification fails at any phase:

1. **Phase 1-2 failure (code changes):**
   ```bash
   git checkout -- pi-agents/ pi-skills/ .pi/
   ```
   Or: `git reset --hard HEAD` on the branch.

2. **Phase 3-4 failure (live test):**
   ```bash
   pi install npm:@tintinweb/pi-subagents
   pi uninstall npm:pi-subagents
   ./install.sh  # restores global agents from repo (which are still tintinweb format on main)
   ```
   Then abandon the branch.

3. **Post-merge failure:**
   Revert the commit: `git revert <commit-sha>`
   Re-install tintinweb: `pi install npm:@tintinweb/pi-subagents`

---

## Effort Estimate

| Phase | Original Estimate | Revised Estimate |
|---|---|---|
| Phase 0: Preparation | 15 min | 15 min |
| Phase 1: Delete unused agents (15 files) | — | **5 min** |
| Phase 2: Skills Rewrite (7 files) | 60 min | **30 min** |
| Phase 3: Global Config | 15 min | 15 min |
| Phase 4: Verification | 30 min | 15 min |
| Phase 5: Cleanup | 15 min | 10 min |
| **Total** | **~3 hours** | **~1.5 hours** |

---

## Decisions (Resolved)

| # | Question | Decision |
|---|---|---|
| 1 | Web search tools | Install `pi-web-access`; map `web-search-researcher` → `researcher` (if needed later) |
| 2 | Skill example syntax | JSON syntax (`subagent({ ... })`) — precise and reproducible |
| 3 | Agent mapping strategy | Delete 15 unused historical agents; map `general-purpose` to `worker` (implementation) and `reviewer` (review) |
| 4 | Parallel repair agent | `worker` with `context: "fresh"` |
| 5 | Review workflow | `requesting-code-review` → `chain`: `scout` (get diff) → `reviewer` (review) |
| 6 | Review loops | Separate sequential subagent calls (pi-subagents chain does not support branching/looping) |
| 7 | Output format compatibility | Test built-in `reviewer` first; create custom agent only if format mismatch breaks parsing |

---

## Appendix: Exact Files to Modify

### Agent Definitions (Delete 15, Keep 0)
```
# ALL DELETED (historical artifacts with zero invocations)
# pi-agents/ directory kept with .gitkeep for future custom agents
```

### Skill Files (7 files)
```
pi-skills/migrate-superpower/SKILL.md               # Remove §4 agent table, update examples
pi-skills/migrate-superpower/skill-mapping.md       # Update tool conventions
pi-skills/dispatching-parallel-agents/SKILL.md      # XML → tasks array with worker
pi-skills/subagent-driven-development/implementer-prompt.md        # general-purpose → worker
pi-skills/subagent-driven-development/spec-reviewer-prompt.md      # general-purpose → reviewer
pi-skills/subagent-driven-development/code-quality-reviewer-prompt.md  # general-purpose → reviewer
pi-skills/brainstorming/spec-document-reviewer-prompt.md  # general-purpose → reviewer
pi-skills/requesting-code-review/SKILL.md           # Single-step → scout → reviewer chain
pi-skills/requesting-code-review/code-reviewer.md   # Update template if it references Agent tool
```

### Config Files (2 files)
```
.pi/subagents.json                    # DELETE (tintinweb-specific)
.pi/extensions/subagent/config.json   # CREATE (optional)
```
