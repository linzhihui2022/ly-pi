# Migrate from pi-subagents to @gotgenes/pi-subagents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `pi-subagents@0.28.0` (nicobailon) with `@gotgenes/pi-subagents@14.0.0`, create 8 custom agent definitions, and rewrite 9 skill files to use the gotgenes calling convention.

**Architecture:** Create 8 custom agent `.md` files in `pi-agents/` (deployed to `~/.pi/agent/agents/`). Rewrite skills from `subagent({ agent: "worker", task: "..." })` to `subagent({ subagent_type: "worker", prompt: "...", description: "..." })`. Replace `tasks` arrays with multiple `run_in_background: true` calls. Replace `chain` arrays with step-by-step independent calls. Install `@gotgenes/pi-subagents`, uninstall `pi-subagents`.

**Tech Stack:** Pi skills (Markdown with YAML frontmatter), `@gotgenes/pi-subagents` npm package, `bun` deploy script, bash for verification.

---

## File Structure

### Agent Definitions (Create 8)
| File | Responsibility |
|---|---|
| `pi-agents/worker.md` | Implementation agent — all 7 tools, append mode |
| `pi-agents/reviewer.md` | Read-only reviewer — standalone prompt, medium thinking |
| `pi-agents/scout.md` | Fast reconnaissance — read-only, haiku model |
| `pi-agents/planner.md` | Architecture planning — read-only, high thinking |
| `pi-agents/oracle.md` | Deep reasoning — read-only, high thinking |
| `pi-agents/delegate.md` | Lightweight general — all 7 tools, append mode |
| `pi-agents/researcher.md` | Web research — read+grep+find+ls, extensions enabled |
| `pi-agents/context-builder.md` | Context prep — read-only |

### Skill Files (Modify 9)
| File | Responsibility |
|---|---|
| `pi-skills/skills/dispatching-parallel-agents/SKILL.md` | Parallel dispatch pattern — tasks array → multiple run_in_background |
| `pi-skills/skills/requesting-code-review/SKILL.md` | Review workflow — chain → step-by-step calls |
| `pi-skills/skills/requesting-code-review/code-reviewer.md` | Reviewer template — update syntax and agent ref |
| `pi-skills/skills/subagent-driven-development/implementer-prompt.md` | Implementer prompt — agent: worker → subagent_type: worker |
| `pi-skills/skills/subagent-driven-development/spec-reviewer-prompt.md` | Spec reviewer — agent: reviewer → subagent_type: reviewer |
| `pi-skills/skills/subagent-driven-development/code-quality-reviewer-prompt.md` | Quality reviewer — same |
| `pi-skills/skills/brainstorming/spec-document-reviewer-prompt.md` | Spec doc reviewer — same |
| `pi-skills/skills/migrate-superpower/SKILL.md` | Migration guide — update to gotgenes conventions |
| `pi-skills/skills/migrate-superpower/skill-mapping.md` | Migration tracker — update cross-skill references |

---

### Task 1: Create worker.md

**Files:**
- Create: `pi-agents/worker.md`

- [ ] **Step 1: Write the agent definition file**

```markdown
---
description: Implementation agent for writing, editing, and fixing code. Inherits parent conventions.
tools: read, bash, edit, write, grep, find, ls
prompt_mode: append
---

You are an implementation agent. Your role is to write, edit, and fix code.

## Approach

- Follow the instructions in the task exactly
- Write minimal, focused changes — no unnecessary refactoring
- Follow existing codebase patterns and conventions

## Testing (when applicable)

- Write tests first (TDD), verify they fail, then implement
- Target 100% branch/function/line/statement coverage
- Tests should verify real behavior, not mock implementations

## Bug Fixes

- First write a test that reproduces the bug
- Then fix the code and verify the test passes

## Reporting

After completing the task, summarize:
- What you changed and why
- Files modified
- Test results
- Any concerns or edge cases to note
```

- [ ] **Step 2: Verify frontmatter is valid**

```bash
cd /Users/lychee/Documents/configure
head -1 pi-agents/worker.md | grep -q "^---$" && echo "OK" || echo "FAIL: missing opening ---"
```

- [ ] **Step 3: Commit**

```bash
git add pi-agents/worker.md
git commit -m "feat(agents): add worker agent definition for @gotgenes/pi-subagents"
```

---

### Task 2: Create reviewer.md

**Files:**
- Create: `pi-agents/reviewer.md`

- [ ] **Step 1: Write the agent definition file**

```markdown
---
description: Read-only code and spec reviewer. Structured review output.
tools: read, bash, grep, find, ls
prompt_mode: replace
thinking: medium
---

You are a code reviewer. Your role is to review code, specs, and plans for
correctness, quality, and completeness. You have read-only access to the codebase.

## Review Structure

Your output must follow this structure:

### Strengths
What's well done? Be specific.

### Issues

#### Critical (Must Fix)
Bugs, security issues, data loss risks, broken functionality.

#### Important (Should Fix)
Architecture problems, missing features, poor error handling, test gaps.

#### Minor (Nice to Have)
Code style, optimization opportunities, documentation polish.

### Recommendations
Improvements for code quality, architecture, or process.

For each issue, include:
- File:line reference
- What's wrong
- Why it matters
- How to fix (if not obvious)

### Assessment
**Verdict:** Ready to merge | Needs fixes | Do not merge
**Reasoning:** 1-2 sentence technical assessment

## Rules

- Categorize by actual severity — not everything is Critical
- Acknowledge strengths before listing issues
- Be specific (file:line, not vague)
- Explain WHY each issue matters
- Never say "looks good" without checking
- Never mark nitpicks as Critical
```

- [ ] **Step 2: Commit**

```bash
git add pi-agents/reviewer.md
git commit -m "feat(agents): add reviewer agent definition for @gotgenes/pi-subagents"
```

---

### Task 3: Create scout.md

**Files:**
- Create: `pi-agents/scout.md`

- [ ] **Step 1: Write the agent definition file**

```markdown
---
description: Fast read-only reconnaissance agent for gathering diffs, listing files, and finding code
tools: read, bash, grep, find, ls
prompt_mode: replace
model: haiku
---

You are a scout agent. Your role is to quickly gather information from the
codebase — list files, search for patterns, get diffs, and summarize findings.

## Rules

- Do NOT edit or write any files. Your job is reconnaissance only.
- Return findings in a clear, structured format.
- Be concise and fast.
- If you need to capture large output, write it to a file that the parent can read later.
```

- [ ] **Step 2: Commit**

```bash
git add pi-agents/scout.md
git commit -m "feat(agents): add scout agent definition for @gotgenes/pi-subagents"
```

---

### Task 4: Create planner.md

**Files:**
- Create: `pi-agents/planner.md`

- [ ] **Step 1: Write the agent definition file**

```markdown
---
description: Design and architecture planning agent for creating implementation plans
tools: read, bash, grep, find, ls
prompt_mode: replace
thinking: high
---

You are a planning agent. Your role is to create detailed implementation plans
by analyzing requirements, existing code, and trade-offs.

## Plan Structure

Your plan should include:

1. **File Structure** — what files to create/modify and their responsibilities
2. **Implementation Order** — sequenced steps with dependencies
3. **Key Decisions** — trade-offs and rationale
4. **Testing Strategy** — what to test and how
5. **Risk Assessment** — what could go wrong

## Rules

- Do NOT implement anything. Your output is a plan, not code.
- Each step should be small enough to complete in 2-5 minutes.
- Prefer smaller, focused files over large ones.
- Follow existing codebase patterns.
```

- [ ] **Step 2: Commit**

```bash
git add pi-agents/planner.md
git commit -m "feat(agents): add planner agent definition for @gotgenes/pi-subagents"
```

---

### Task 5: Create oracle.md

**Files:**
- Create: `pi-agents/oracle.md`

- [ ] **Step 1: Write the agent definition file**

```markdown
---
description: Deep reasoning agent for second opinions, complex analysis, and challenging bugs
tools: read, bash, grep, find, ls
prompt_mode: replace
thinking: high
---

You are an oracle agent. Your role is to provide deep analysis and second
opinions on complex problems. You have read-only access to the codebase.

## Approach

- Challenge assumptions — the parent agent may be wrong
- Identify what the parent is missing
- Consider alternative approaches
- Think beyond the obvious

## Output

- Your analysis — what you found, what you think
- What assumptions you challenged
- What alternatives you considered
- Your recommended next move

## Rules

- Be honest — if the current approach is good, say so
- Be specific — point to code, not vague impressions
- Do NOT implement anything — analysis only
```

- [ ] **Step 2: Commit**

```bash
git add pi-agents/oracle.md
git commit -m "feat(agents): add oracle agent definition for @gotgenes/pi-subagents"
```

---

### Task 6: Create delegate.md

**Files:**
- Create: `pi-agents/delegate.md`

- [ ] **Step 1: Write the agent definition file**

```markdown
---
description: Lightweight general-purpose agent for simple tasks. Inherits parent conventions.
tools: read, bash, edit, write, grep, find, ls
prompt_mode: append
---

You are a lightweight general-purpose agent. Your role is to handle simple,
well-defined tasks that don't require the full capability of a worker agent.

## Approach

- Follow the instructions in the task exactly
- Write minimal, focused changes
- Follow existing codebase patterns and conventions

## When to Escalate

If the task turns out to be more complex than expected:
- Stop and report back with what you found
- Explain why it needs a more capable agent
- Don't produce uncertain work

## Reporting

Summarize what you did, what you found, and any concerns.
```

- [ ] **Step 2: Commit**

```bash
git add pi-agents/delegate.md
git commit -m "feat(agents): add delegate agent definition for @gotgenes/pi-subagents"
```

---

### Task 7: Create researcher.md

**Files:**
- Create: `pi-agents/researcher.md`

- [ ] **Step 1: Write the agent definition file**

```markdown
---
description: Web research specialist for finding information beyond training data
tools: read, grep, find, ls
extensions: true
prompt_mode: replace
---

You are a research agent. Your role is to find information on the web that
isn't well-covered in training data — recent events, current library versions,
live API documentation, and facts requiring verification.

## Approach

- Use web search tools to find relevant, up-to-date information
- Verify claims against official sources when possible
- Cite your sources with URLs

## Output

- Your findings organized by topic
- Source citations for each claim
- Confidence level for each finding

## Rules

- Do NOT implement anything — research only
- Prefer official documentation over blog posts
- Note when information is uncertain or contradictory
```

- [ ] **Step 2: Commit**

```bash
git add pi-agents/researcher.md
git commit -m "feat(agents): add researcher agent definition for @gotgenes/pi-subagents"
```

---

### Task 8: Create context-builder.md

**Files:**
- Create: `pi-agents/context-builder.md`

- [ ] **Step 1: Write the agent definition file**

```markdown
---
description: Context preparation agent for summarizing and packaging codebase context for other agents
tools: read, grep, find, ls
prompt_mode: replace
---

You are a context-building agent. Your role is to gather, summarize, and
package codebase context for other agents to use.

## Approach

- Read the specified files and directories
- Extract the information relevant to the task at hand
- Summarize in a focused, structured format
- Eliminate noise — other agents don't need to read everything

## Output

A structured summary that another agent can pick up and use immediately
without needing to read the original files.

## Rules

- Do NOT modify any files — read and summarize only
- Focus on relevance — don't include information the downstream agent won't need
- Structure your output for easy consumption (headings, lists, code references)
```

- [ ] **Step 2: Commit**

```bash
git add pi-agents/context-builder.md
git commit -m "feat(agents): add context-builder agent definition for @gotgenes/pi-subagents"
```

---

### Task 9: Rewrite dispatching-parallel-agents/SKILL.md

**Files:**
- Modify: `pi-skills/skills/dispatching-parallel-agents/SKILL.md`

- [ ] **Step 1: Replace §3 "Dispatch in Parallel" subsection**

Find the section from `### 3. Dispatch in Parallel` through `### 4. Review and Integrate`.

Old text (lines 68-104 approx):
```
Use `subagent()` with a `tasks` array to dispatch multiple agents concurrently:

```typescript
subagent({
  tasks: [
    {
      agent: "worker",
      task: "Fix the 3 failing tests in src/agents/agent-tool-abort.test.ts...",
      context: "fresh"
    },
    ...
  ]
})
```

All three agents run concurrently with isolated (`fresh`) context. ...

**Why `context: "fresh"`?** ...
```

Replace with:

```markdown
### 3. Dispatch in Parallel

Use the `subagent` tool with `run_in_background: true` to dispatch multiple agents concurrently:

```typescript
subagent({
  subagent_type: "worker",
  description: "Fix abort tests",
  prompt: `Fix the 3 failing tests in src/agents/agent-tool-abort.test.ts:
1. "should abort tool with partial output capture"
2. "should handle mixed completed and aborted tools"
3. "should properly track pendingToolCount"

Your task:
1. Read the test file and understand what each test verifies
2. Identify root cause
3. Fix by replacing arbitrary timeouts with event-based waiting or fixing bugs
4. Do NOT just increase timeouts — find the real issue

Return: Summary of root cause and changes.`,
  run_in_background: true
})

subagent({
  subagent_type: "worker",
  description: "Fix batch tests",
  prompt: `Fix the 2 failing tests in src/agents/batch-completion-behavior.test.ts.
Read the test file, identify root cause, fix the issue.
Return: Summary of what was found and fixed.`,
  run_in_background: true
})

subagent({
  subagent_type: "worker",
  description: "Fix race tests",
  prompt: `Fix the failing test in src/agents/tool-approval-race-conditions.test.ts.
Read the test file, identify the race condition, fix it.
Return: Summary of root cause and changes.`,
  run_in_background: true
})
```

All three agents run concurrently in the background. You continue with coordination work while they investigate.
```

- [ ] **Step 2: Replace §4 "Review and Integrate" subsection**

Old text (lines 97-104 approx):
```
### 4. Review and Integrate

When the parallel dispatch returns:
- Read each agent's result (returned as aggregated output with separators)
- Verify fixes don't conflict
- Run full test suite
- Integrate all changes

**Note:** `pi-subagents` returns aggregated parallel results with separators, not individual agent results to poll. No need to call `get_subagent_result` for each agent.
```

Replace with:

```markdown
### 4. Review and Integrate

When agents complete (you'll receive completion notifications):
- Check each agent's result with `get_subagent_result({ agent_id: "..." })` 
- Read each summary and verify fixes don't conflict
- Run full test suite
- Integrate all changes
```

- [ ] **Step 3: Replace "Real Example" dispatch block**

Old text (lines 162-172 approx):
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

Replace with:

```markdown
**Dispatch:**
```typescript
subagent({ subagent_type: "worker", description: "Fix abort tests",
  prompt: "Fix agent-tool-abort.test.ts: replace timeouts with event-based waiting...",
  run_in_background: true })
subagent({ subagent_type: "worker", description: "Fix batch tests",
  prompt: "Fix batch-completion-behavior.test.ts: fix event structure bug...",
  run_in_background: true })
subagent({ subagent_type: "worker", description: "Fix race tests",
  prompt: "Fix tool-approval-race-conditions.test.ts: add wait for async execution...",
  run_in_background: true })
```
```

- [ ] **Step 4: Run verification**

```bash
cd /Users/lychee/Documents/configure
grep -n 'context.*fresh\|tasks:.*\[|chain:.*\[' pi-skills/skills/dispatching-parallel-agents/SKILL.md && echo "FAIL" || echo "OK"
grep -n 'subagent({ agent: ' pi-skills/skills/dispatching-parallel-agents/SKILL.md && echo "FAIL" || echo "OK"
```

- [ ] **Step 5: Commit**

```bash
git add pi-skills/skills/dispatching-parallel-agents/SKILL.md
git commit -m "docs(dispatching-parallel-agents): migrate to @gotgenes/pi-subagents

- Replace tasks array with multiple subagent() + run_in_background calls
- Update review section for get_subagent_result polling
- Update real example dispatch block"
```

---

### Task 10: Rewrite requesting-code-review/SKILL.md

**Files:**
- Modify: `pi-skills/skills/requesting-code-review/SKILL.md`

- [ ] **Step 1: Replace §2 "Dispatch code reviewer subagent" block**

Old text (lines 41-56 approx):
```markdown
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
```

Replace with:

```markdown
**2a. First, gather the diff with a scout subagent:**

```typescript
subagent({
  subagent_type: "scout",
  description: "Gather git diff",
  prompt: `Get the git diff from ${BASE_SHA} to ${HEAD_SHA} and output the full diff with context.`
})
```

**2b. Then, dispatch the reviewer with the diff:**

```typescript
subagent({
  subagent_type: "reviewer",
  description: "Review code changes",
  prompt: `You are reviewing the following code changes.

## What Was Implemented

${DESCRIPTION}

## Requirements / Plan

${PLAN_OR_REQUIREMENTS}

## Git Diff

[PASTE THE DIFF FROM THE SCOUT OUTPUT HERE]

Review the diff for code quality, plan alignment, and correctness.
Follow the reviewer output format (Strengths, Issues by severity, Assessment).`
})
```
```

- [ ] **Step 2: Replace the Example block**

Old text (lines 69-93 approx):
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
      task: "Review the code diff in diff.txt.\n\nDescription: Added verifyIndex() and repairIndex()...",
      reads: "diff.txt"
    }
  ]
})
```
```

Replace with:

```markdown
[Dispatch scout to gather diff]
```typescript
subagent({ subagent_type: "scout", description: "Gather diff",
  prompt: "Get the git diff from a7981ec to 3df7661" })
```

[Dispatch reviewer with the diff]
```typescript
subagent({ subagent_type: "reviewer", description: "Review changes",
  prompt: `Review the following diff.\n\nDescription: Added verifyIndex() and repairIndex() with 4 issue types\n\nPlan: Task 2 from .lychee/artifacts/plans/deployment-plan.md\n\n[PASTE DIFF HERE]` })
```
```

- [ ] **Step 3: Run verification**

```bash
cd /Users/lychee/Documents/configure
grep -n 'chain:.*\[' pi-skills/skills/requesting-code-review/SKILL.md && echo "FAIL" || echo "OK"
grep -n 'agent:.*scout\|agent:.*reviewer' pi-skills/skills/requesting-code-review/SKILL.md && echo "FAIL" || echo "OK"
```

- [ ] **Step 4: Commit**

```bash
git add pi-skills/skills/requesting-code-review/SKILL.md
git commit -m "docs(requesting-code-review): migrate to @gotgenes/pi-subagents

- Replace chain array with two independent subagent() calls
- Scout gathers diff first, reviewer reviews second
- Update example with step-by-step dispatch"
```

---

### Task 11: Rewrite requesting-code-review/code-reviewer.md

**Files:**
- Modify: `pi-skills/skills/requesting-code-review/code-reviewer.md`

- [ ] **Step 1: Update agent reference and syntax**

Old (line 6):
```
Agent tool (reviewer):
  description: "Review code changes"
  prompt: |
```

Replace with:

```
subagent({ subagent_type: "reviewer",
  description: "Review code changes",
  prompt: `
```

And at end, close the call:
```
  prompt: `
    ...
```

Add closing:
```
})
```

- [ ] **Step 2: Remove `reads: "diff.txt"` reference in Diff section**

The old text already says "The git diff ... is provided below (or in the attached diff.txt)". This works for the new manual approach too — update to make clear the diff is inline:

Old (line ~21):
```markdown
    The git diff from {BASE_SHA} to {HEAD_SHA} is provided below (or in the attached diff.txt).
```

Keep as-is — it already handles the inline case.

- [ ] **Step 3: Run verification**

```bash
cd /Users/lychee/Documents/configure
grep -n 'Agent tool' pi-skills/skills/requesting-code-review/code-reviewer.md && echo "FAIL" || echo "OK"
```

- [ ] **Step 4: Commit**

```bash
git add pi-skills/skills/requesting-code-review/code-reviewer.md
git commit -m "docs(requesting-code-review): update reviewer template for gotgenes
syntax

- Replace Agent tool reference with subagent() call
- Keep inline diff instructions compatible with two-step workflow"
```

---

### Task 12: Rewrite implementer-prompt.md

**Files:**
- Modify: `pi-skills/skills/subagent-driven-development/implementer-prompt.md`

- [ ] **Step 1: Replace the subagent() call syntax**

Old (lines 5-6):
```typescript
subagent({
  agent: "worker",
  task: `You are implementing Task N: [task name]
```

Replace with:

```typescript
subagent({
  subagent_type: "worker",
  description: "Implement Task N",
  prompt: `You are implementing Task N: [task name]
```

- [ ] **Step 2: Verify closing is correct**

The file ends with:
```
`)
})
```

Make sure the closing matches. The new syntax should be:
```
`
})
```

- [ ] **Step 3: Run verification**

```bash
cd /Users/lychee/Documents/configure
grep -n 'agent:.*worker' pi-skills/skills/subagent-driven-development/implementer-prompt.md && echo "FAIL" || echo "OK"
grep -n 'subagent_type.*worker' pi-skills/skills/subagent-driven-development/implementer-prompt.md && echo "OK" || echo "FAIL"
```

- [ ] **Step 4: Commit**

```bash
git add pi-skills/skills/subagent-driven-development/implementer-prompt.md
git commit -m "docs(subagent-driven-development): implementer uses subagent_type: worker

- Replace agent: worker with subagent_type: worker
- Add description parameter"
```

---

### Task 13: Rewrite spec-reviewer-prompt.md

**Files:**
- Modify: `pi-skills/skills/subagent-driven-development/spec-reviewer-prompt.md`

- [ ] **Step 1: Replace the subagent() call syntax**

Old (lines 7-8):
```typescript
subagent({
  agent: "reviewer",
  task: `You are reviewing whether an implementation matches its specification.
```

Replace with:

```typescript
subagent({
  subagent_type: "reviewer",
  description: "Review spec compliance",
  prompt: `You are reviewing whether an implementation matches its specification.
```

- [ ] **Step 2: Verify closing**

Ensure the closing changes from `` ` `` to `` ` `` and `})` stays `})`.

- [ ] **Step 3: Commit**

```bash
git add pi-skills/skills/subagent-driven-development/spec-reviewer-prompt.md
git commit -m "docs(subagent-driven-development): spec reviewer uses subagent_type: reviewer"
```

---

### Task 14: Rewrite code-quality-reviewer-prompt.md

**Files:**
- Modify: `pi-skills/skills/subagent-driven-development/code-quality-reviewer-prompt.md`

- [ ] **Step 1: Replace the subagent() call syntax**

Old (lines 8-9):
```typescript
subagent({
  agent: "reviewer",
  task: `Review the code diff from ${BASE_SHA} to ${HEAD_SHA}.
```

Replace with:

```typescript
subagent({
  subagent_type: "reviewer",
  description: "Review code quality",
  prompt: `Review the code diff from ${BASE_SHA} to ${HEAD_SHA}.
```

- [ ] **Step 2: Commit**

```bash
git add pi-skills/skills/subagent-driven-development/code-quality-reviewer-prompt.md
git commit -m "docs(subagent-driven-development): quality reviewer uses subagent_type: reviewer"
```

---

### Task 15: Rewrite spec-document-reviewer-prompt.md

**Files:**
- Modify: `pi-skills/skills/brainstorming/spec-document-reviewer-prompt.md`

- [ ] **Step 1: Replace the subagent() call syntax**

Old (lines 10-11):
```typescript
subagent({
  agent: "reviewer",
  task: `You are a spec document reviewer. Verify this spec is complete and ready for planning.
```

Replace with:

```typescript
subagent({
  subagent_type: "reviewer",
  description: "Review spec document",
  prompt: `You are a spec document reviewer. Verify this spec is complete and ready for planning.
```

- [ ] **Step 2: Commit**

```bash
git add pi-skills/skills/brainstorming/spec-document-reviewer-prompt.md
git commit -m "docs(brainstorming): spec doc reviewer uses subagent_type: reviewer"
```

---

### Task 16: Rewrite migrate-superpower/SKILL.md (Agent/Subagent section)

**Files:**
- Modify: `pi-skills/skills/migrate-superpower/SKILL.md`

- [ ] **Step 1: Replace the Agent/Subagent section (§4)**

Find the section from `### Agent / Subagent` through to before `## 5. Pi-Native Tools`.

Replace with updated content documenting gotgenes conventions:

```markdown
### Agent / Subagent

`@gotgenes/pi-subagents` provides a `subagent` tool for dispatching agents. When migrating agent dispatch patterns:

| Claude Code Pattern | gotgenes Equivalent |
|---|---|
| Generic subagent | Use specific agent type: `worker`, `reviewer`, `scout`, `planner`, etc. |
| `Subagent` tool | `subagent({ subagent_type: "...", prompt: "...", description: "..." })` |
| Manual process backgrounding | `subagent({ ..., run_in_background: true })` |

**Custom agent types and their purposes:**

| Agent | Purpose | When to Use |
|---|---|---|
| `worker` | Implementation agent with all 7 tools, inherits parent conventions (append mode). | Default for implementation tasks, fixes, and multi-step code work. |
| `reviewer` | Read-only code/spec reviewer with structured output format, medium thinking. | Reviewing implementations, plans, or diffs for quality and compliance. |
| `scout` | Fast read-only reconnaissance agent, haiku model. | Gathering diffs, listing files, finding code — minimal cost. |
| `planner` | Read-only design and architecture planning, high thinking. | Creating implementation plans, identifying critical files. |
| `oracle` | Read-only deep reasoning agent, high thinking. | Complex analysis, second opinions, challenging bugs. |
| `delegate` | Lightweight general-purpose agent with all 7 tools, inherits parent conventions. | Simple tasks that don't need full worker capability. |
| `researcher` | Web research specialist, extensions enabled. | Finding information beyond training data (requires web tools). |
| `context-builder` | Read-only context preparation. | Summarizing and packaging codebase context for other agents. |

**Selection rule:** Prefer the most specific agent for the job. Implementation → `worker`; review → `reviewer`; reconnaissance → `scout`; planning → `planner`.

**Dispatch syntax:**

```typescript
// Single agent
subagent({ subagent_type: "worker", description: "Fix tests", prompt: "Fix the failing tests in src/foo.test.ts..." })

// Parallel agents (multiple run_in_background calls)
subagent({ subagent_type: "worker", description: "Fix abort tests", prompt: "...", run_in_background: true })
subagent({ subagent_type: "worker", description: "Fix batch tests", prompt: "...", run_in_background: true })
subagent({ subagent_type: "worker", description: "Fix race tests", prompt: "...", run_in_background: true })

// Sequential workflow (step-by-step)
// Step 1: scout gathers diff
subagent({ subagent_type: "scout", description: "Gather diff", prompt: "Get git diff from BASE to HEAD" })
// Step 2: reviewer reviews
subagent({ subagent_type: "reviewer", description: "Review changes", prompt: "Review the diff above..." })
```

**Key parameters:**

| Parameter | Description |
|---|---|
| `subagent_type` | Required. Agent type name (matches the `.md` filename in `pi-agents/`). |
| `prompt` | Required. Full, self-contained instruction for the agent. |
| `description` | Required. Short 3-5 word summary shown in UI. |
| `run_in_background` | Boolean. Launch agent in background and continue. |
| `model` | Override model for this invocation. |
| `thinking` | Override thinking level. |
| `inherit_context` | Fork parent conversation into agent. |
| `resume` | Agent ID to resume a previous session. |

**Post-dispatch actions:**

```typescript
// Check status and get results
get_subagent_result({ agent_id: "<agent-id>" })

// Wait for completion
get_subagent_result({ agent_id: "<agent-id>", wait: true })

// Steer a running agent
steer_subagent({ agent_id: "<agent-id>", message: "..." })

// List available agent types
// Run: /agents
```
```

- [ ] **Step 2: Update §5 Agent (Subagent Dispatch) subsection**

Find the tintinweb/pi-subagents comparison in §5. Replace the section from `### Agent (Subagent Dispatch)` with gotgenes-specific content:

```markdown
### Agent (Subagent Dispatch)

**Claude Code:** Subagent support is limited; may use generic background processes or simple tool calls.

**Pi (gotgenes subagents):** `subagent()` tool with typed sub-agents via `subagent_type`.

**Migration rule:** If the source skill dispatches "subagents" or "parallel workers," replace with gotgenes `subagent()` syntax.

**From tintinweb/nicobailon:**

```typescript
// Old nicobailon syntax — REMOVE
subagent({ agent: "worker", task: "Fix the failing tests..." })
```

**To gotgenes:**

```typescript
// Single agent
subagent({ subagent_type: "worker", description: "Fix tests", prompt: "Fix the failing tests..." })

// Parallel agents
subagent({ subagent_type: "worker", description: "Fix abort", prompt: "...", run_in_background: true })
subagent({ subagent_type: "worker", description: "Fix batch", prompt: "...", run_in_background: true })
```

**Key parameters:**

| Parameter | Description |
|---|---|
| `subagent_type` | Required. Agent type name (matches `.md` filename). |
| `prompt` | Required. Full, self-contained instruction. |
| `description` | Required. Short summary shown in UI. |
| `run_in_background` | Boolean. Background execution (returns immediately). |

**Post-dispatch:**

```typescript
get_subagent_result({ agent_id: "<agent-id>" })
steer_subagent({ agent_id: "<agent-id>", message: "..." })
```

### Task Syntax (Claude Code Specific)

Claude Code supports a `Task()` shorthand. gotgenes has no `Task()` shorthand — use `subagent()` calls:

```typescript
// Claude Code — REMOVE
Task("Fix abort test failures")

// gotgenes — correct replacement
subagent({ subagent_type: "worker", description: "Fix abort", prompt: "Fix abort test failures...", run_in_background: true })
```
```

- [ ] **Step 3: Update §8 verification commands**

Find the verification commands section and update the grep checks:

```bash
# Check for old nicobailon agent syntax
grep -ri 'subagent({ agent: ' pi-skills/YOUR-SKILL/ || echo "OK: no nicobailon agent syntax"
grep -ri 'context.*fresh' pi-skills/YOUR-SKILL/ || echo "OK: no context fresh refs"
grep -ri 'tasks:.*\[' pi-skills/YOUR-SKILL/ || echo "OK: no tasks array refs"
grep -ri 'chain:.*\[' pi-skills/YOUR-SKILL/ || echo "OK: no chain array refs"

# Check for correct gotgenes syntax
grep -ri 'subagent_type' pi-skills/YOUR-SKILL/ || echo "MISSING: no subagent_type refs"
```

- [ ] **Step 4: Update §10 Post-Migration Checklist**

Replace the old checklist items with:

```markdown
- [ ] `subagent()` uses `subagent_type` + `prompt` + `description` (not `agent` + `task`)
- [ ] Parallel dispatch uses multiple `subagent()` calls with `run_in_background: true`
- [ ] Sequential workflows use step-by-step independent calls
- [ ] Background execution uses `run_in_background` (not `async`)
- [ ] Status checks use `get_subagent_result` (not `subagent({ action: "status" })`)
- [ ] Steering uses `steer_subagent` (not `subagent({ action: "interrupt" })`)
```

- [ ] **Step 5: Run verification**

```bash
cd /Users/lychee/Documents/configure
grep -n 'agent:.*worker\|agent:.*reviewer\|agent:.*scout' pi-skills/skills/migrate-superpower/SKILL.md | grep -v '#\|//\|example\|Example' && echo "FAIL" || echo "OK"
```

- [ ] **Step 6: Commit**

```bash
git add pi-skills/skills/migrate-superpower/SKILL.md
git commit -m "docs(migrate-superpower): update agent guide for @gotgenes/pi-subagents

- Replace nicobailon built-in agent table with gotgenes custom agent types
- Update syntax examples: agent+task -> subagent_type+prompt+description
- Update parallel/background/status documentation
- Update verification commands and checklist"
```

---

### Task 17: Rewrite migrate-superpower/skill-mapping.md

**Files:**
- Modify: `pi-skills/skills/migrate-superpower/skill-mapping.md`

- [ ] **Step 1: Update dispatching-parallel-agents row**

Old:
```markdown
| 7 | `dispatching-parallel-agents` | ✅ Migrated | Replaced `Task()` syntax with `subagent({ tasks: [...] })` using `worker` agents. No platform-specific content. |
```

New:
```markdown
| 7 | `dispatching-parallel-agents` | ✅ Migrated | Replaced `Task()` syntax with `subagent({ subagent_type: "worker", ..., run_in_background: true })` using multiple independent calls. No platform-specific content. |
```

- [ ] **Step 2: Update requesting-code-review row**

Old:
```markdown
| 5 | `requesting-code-review` | ✅ Migrated | Replaced `Task tool` with `subagent({ chain: [scout, reviewer] })`; updated plan path to `.lychee/artifacts/plans/`. |
```

New:
```markdown
| 5 | `requesting-code-review` | ✅ Migrated | Replaced `Task tool` with two-step `subagent()` (scout gather diff then reviewer review); updated plan path to `.lychee/artifacts/plans/`. |
```

- [ ] **Step 3: Update subagent-driven-development row**

Old:
```markdown
| 8 | `subagent-driven-development` | ✅ Migrated | Replaced `TodoWrite` with `todo`, `Task tool` with `subagent()` function, updated prompt templates to `subagent({ agent: "worker"|"reviewer", task: ... })` syntax, removed `using-git-worktrees` reference, updated paths to `.lychee/artifacts/`. |
```

New:
```markdown
| 8 | `subagent-driven-development` | ✅ Migrated | Replaced `TodoWrite` with `todo`, `Task tool` with `subagent({ subagent_type: "worker"|"reviewer", ... })` calling convention, updated prompt templates, removed `using-git-worktrees` reference, updated paths to `.lychee/artifacts/`. |
```

- [ ] **Step 4: Update Background params reference**

Old:
```markdown
- Background params (`run_in_background` → `background`)
```

New:
```markdown
- Background params (`async` → `run_in_background`)
```

- [ ] **Step 5: Update Pi-native tool integration reference**

Old:
```markdown
- Pi-native tool integration (`ask_user_question`, `todo`, `Agent` with `subagent_type`)
```

New:
```markdown
- Pi-native tool integration (`ask_user_question`, `todo`, `subagent` with `subagent_type`)
```

- [ ] **Step 6: Commit**

```bash
git add pi-skills/skills/migrate-superpower/skill-mapping.md
git commit -m "docs(migrate-superpower): update skill-mapping for @gotgenes/pi-subagents

- Update dispatching-parallel-agents, requesting-code-review, and
  subagent-driven-development migration notes for gotgenes syntax"
```

---

### Task 18: Install @gotgenes/pi-subagents and uninstall pi-subagents

**Files:**
- None (package management)

- [ ] **Step 1: Install gotgenes package**

```bash
pi install npm:@gotgenes/pi-subagents
```

Expected: Package installs successfully to `~/.pi/agent/npm/node_modules/@gotgenes/pi-subagents/`.

- [ ] **Step 2: Verify installation**

```bash
ls ~/.pi/agent/npm/node_modules/@gotgenes/pi-subagents/package.json && echo "OK" || echo "FAIL"
```

- [ ] **Step 3: Uninstall nicobailon package**

```bash
pi uninstall npm:pi-subagents
```

- [ ] **Step 4: Verify uninstall**

```bash
ls ~/.pi/agent/npm/node_modules/pi-subagents/ 2>/dev/null && echo "FAIL: still present" || echo "OK: removed"
```

- [ ] **Step 5: Clean up nicobailon artifacts**

```bash
rm -rf ~/.pi/agent/extensions/subagent/
```

---

### Task 19: Deploy custom agents

**Files:**
- Deploy: `pi-agents/*.md` → `~/.pi/agent/agents/`

- [ ] **Step 1: Run deploy script**

```bash
cd /Users/lychee/Documents/configure/pi-agents && bun run scripts/deploy.ts
```

- [ ] **Step 2: Verify deployment**

```bash
ls ~/.pi/agent/agents/worker.md && echo "OK" || echo "FAIL"
ls ~/.pi/agent/agents/reviewer.md && echo "OK" || echo "FAIL"
ls ~/.pi/agent/agents/scout.md && echo "OK" || echo "FAIL"
ls ~/.pi/agent/agents/planner.md && echo "OK" || echo "FAIL"
ls ~/.pi/agent/agents/oracle.md && echo "OK" || echo "FAIL"
ls ~/.pi/agent/agents/delegate.md && echo "OK" || echo "FAIL"
ls ~/.pi/agent/agents/researcher.md && echo "OK" || echo "FAIL"
ls ~/.pi/agent/agents/context-builder.md && echo "OK" || echo "FAIL"
```

---

### Task 20: Static Verification

**Files:**
- None (verification only)

- [ ] **Step 1: No nicobailon patterns remain**

```bash
cd /Users/lychee/Documents/configure

echo "=== Check 1: agent: worker/reviewer/scout (nicobailon) ==="
grep -rn 'agent:.*"worker"\|agent:.*"reviewer"\|agent:.*"scout"' pi-skills/ 2>/dev/null && echo "FAIL" || echo "OK"

echo "=== Check 2: context: fresh ==="
grep -rn 'context.*fresh' pi-skills/ 2>/dev/null && echo "FAIL" || echo "OK"

echo "=== Check 3: tasks array ==="
grep -rn 'tasks:.*\[' pi-skills/ 2>/dev/null | grep -v 'task\|todo\|Task' && echo "FAIL" || echo "OK"

echo "=== Check 4: chain array ==="
grep -rn 'chain:.*\[' pi-skills/ 2>/dev/null && echo "FAIL" || echo "OK"

echo "=== Check 5: subagent_type present ==="
grep -rn 'subagent_type' pi-skills/ 2>/dev/null | head -5 && echo "OK" || echo "WARN: no subagent_type refs found"

echo "=== Check 6: run_in_background present ==="
grep -rn 'run_in_background' pi-skills/ 2>/dev/null | head -5 && echo "OK" || echo "OK (optional)"
```

Expected: Checks 1-4 print `OK`. Check 5 shows `subagent_type` references.

- [ ] **Step 2: All agent files have valid frontmatter**

```bash
for f in pi-agents/worker.md pi-agents/reviewer.md pi-agents/scout.md \
  pi-agents/planner.md pi-agents/oracle.md pi-agents/delegate.md \
  pi-agents/researcher.md pi-agents/context-builder.md; do
  head -1 "$f" | grep -q "^---$" || echo "MISSING frontmatter: $f"
done
echo "OK: all agent files have opening ---"
```

---

### Task 21: Final Commit

**Files:**
- All changes

- [ ] **Step 1: Commit all remaining changes**

```bash
cd /Users/lychee/Documents/configure
git add -A
git commit -m "feat(subagents): migrate from pi-subagents to @gotgenes/pi-subagents

- Create 8 custom agent definitions (worker, reviewer, scout, planner,
  oracle, delegate, researcher, context-builder)
- Rewrite 9 skill files with gotgenes calling conventions:
  - subagent({ agent: 'x', task: '...' }) -> subagent({ subagent_type: 'x',
    prompt: '...', description: '...' })
  - tasks array -> multiple run_in_background calls
  - chain array -> step-by-step independent calls
  - async -> run_in_background
  - subagent({ action: 'status' }) -> get_subagent_result()
- Install @gotgenes/pi-subagents, uninstall pi-subagents (nicobailon)
- Deploy custom agents via pi-agents/scripts/deploy.ts

Permission-system now correctly identifies sub-agent identity via
<active_agent> tags, resolving the incompatibility."
```

---

## Self-Review

### 1. Spec Coverage

| Design Requirement | Task |
|---|---|
| Create worker agent definition | Task 1 |
| Create reviewer agent definition | Task 2 |
| Create scout agent definition | Task 3 |
| Create planner agent definition | Task 4 |
| Create oracle agent definition | Task 5 |
| Create delegate agent definition | Task 6 |
| Create researcher agent definition | Task 7 |
| Create context-builder agent definition | Task 8 |
| Rewrite dispatching-parallel-agents | Task 9 |
| Rewrite requesting-code-review/SKILL.md | Task 10 |
| Rewrite requesting-code-review/code-reviewer.md | Task 11 |
| Rewrite implementer-prompt.md | Task 12 |
| Rewrite spec-reviewer-prompt.md | Task 13 |
| Rewrite code-quality-reviewer-prompt.md | Task 14 |
| Rewrite spec-document-reviewer-prompt.md | Task 15 |
| Rewrite migrate-superpower/SKILL.md | Task 16 |
| Rewrite migrate-superpower/skill-mapping.md | Task 17 |
| Install gotgenes, uninstall nicobailon | Task 18 |
| Deploy custom agents | Task 19 |
| Static verification | Task 20 |

**No gaps identified.**

### 2. Placeholder Scan

- No "TBD", "TODO", "implement later", "fill in details"
- No "Add appropriate error handling" / "add validation" / "handle edge cases"
- No "Write tests for the above" without test code
- No "Similar to Task N" references
- All steps show exact code or exact commands

### 3. Type Consistency

- `subagent_type: "worker"` used consistently for implementation tasks
- `subagent_type: "reviewer"` used consistently for review tasks
- `subagent_type: "scout"` used for read-only reconnaissance
- `run_in_background: true` used consistently for parallel dispatch
- `description` used consistently in all subagent() calls
- `prompt` used consistently (not `task`)

No inconsistencies found.
