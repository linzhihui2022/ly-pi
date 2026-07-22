---
name: writing-plan-for-ticket
description: Use when converting a Linear-style markdown ticket into a detailed implementation plan before writing code.
---

# Writing Plan for Ticket

## Overview

Convert a Linear-style markdown ticket (`tickets/NNN-<name>/ticket.md`) into a concrete, task-by-task implementation plan. The plan assumes the implementer has zero codebase context and questionable taste, so document everything: file paths, exact code, test commands, and how to verify each deliverable. DRY. YAGNI. TDD. Frequent commits.

**Announce at start:** "I'm using the writing-plan-for-ticket skill to turn this ticket into an implementation plan."

**Save plans to:** `plan.md` in the same directory as the ticket (e.g., `tickets/NNN-<name>/plan.md`).
- (User preferences for plan location override this default.)

## When to Use

Use this skill when:
- A user asks to turn a ticket into an implementation plan.
- The ticket is a Linear-style markdown ticket with YAML frontmatter and Gherkin acceptance criteria.
- You need to produce a step-by-step plan for a coding agent or human implementer.

Do NOT use for:
- Tickets in other formats (Jira, GitHub Issues) unless they are first converted to Linear-style markdown.
- Writing plans directly from a design/spec file; use a general planning workflow instead.

## Input: Linear-Style Markdown Ticket

Read the ticket file at the path the user provides. The ticket MUST have:

```yaml
---
Title: <concise ticket title>
Status: TODO
Labels: <comma-separated labels>
Estimate: <1 | 2 | 3 | 5 | 8 | 13>
Depends: <comma-separated ticket titles or empty>
PHASE: <number>
CYCLE: <number>
Source: <path-to-source-design-file>
---
```

Followed by:

```markdown
# <Title>

## User Story
As a <role>, I want <feature>, So that <expected outcome>.

## Scope
### Includes
- ...

### Excludes
- ...

## Acceptance Criteria
### Scenario 1: ...
Given...
When...
Then...

## Open Questions (optional)
- ...

## Next Tickets (optional)
- ...

## References
- <link title>(<url>)
```

## Information Completeness Check

Before writing the plan, check whether the ticket provides enough context to produce concrete implementation steps. Stop and ask the user if any of these are missing:

1. **Target codebase files or modules** — which existing files must be changed or created?
2. **Tech stack details** — language, framework, test runner, build tool, or any project-specific constraints not already in the global spec.
3. **Exact behavior for edge cases** — what should happen when inputs are invalid, missing, or out of range?
4. **Dependencies on other tickets** — if `Depends` is non-empty, are those prerequisites already implemented?
5. **Test expectations** — test framework, required coverage, or any test files that must be updated.

If the ticket is missing critical information, ask concise, specific questions. Do not proceed with the plan until the user answers.

## Scope Check

If the ticket covers multiple independent subsystems, suggest splitting it into separate tickets first (use `split-design-into-tickets`). Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure — but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Task Right-Sizing

A task is the smallest unit that carries its own test cycle and is worth a fresh reviewer's gate. When drawing task boundaries: fold setup, configuration, scaffolding, and documentation steps into the task whose deliverable needs them; split only where a reviewer could meaningfully reject one task while approving its neighbor. Each task ends with an independently testable deliverable.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Ticket Title] Implementation Plan

> Ticket: `tickets/NNN-<ticket-name>/ticket.md`
> Plan: `tickets/NNN-<ticket-name>/plan.md`
> **For implementers:** Execute tasks in order and track each checkbox (`- [ ]`). Preserve every test-first, verification, and commit step.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

## Global Constraints

[The ticket's project-wide requirements — version floors, dependency limits, naming and copy rules, platform requirements — one line each, with exact values copied verbatim from the ticket or the source design. Every task's requirements implicitly include this section.]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Interfaces:**
- Consumes: [what this task uses from earlier tasks — exact signatures]
- Produces: [what later tasks rely on — exact function names, parameter and return types. A task's implementer sees only their own task; this block is how they learn the names and types neighboring tasks use.]

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## Mapping Acceptance Criteria to Tasks

For each Gherkin scenario in the ticket, ensure at least one task explicitly covers it. If a scenario is large, split it across multiple tasks. If multiple scenarios are trivially handled together, combine them into one task.

**Traceability:** Add a short note under each task's header stating which scenario(s) it covers:

```markdown
> Covers: Scenario 1 (Paginate inbox items), Scenario 3 (Update unread badge)
```

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Remember
- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

## Self-Review

After writing the complete plan, look at the ticket with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Ticket coverage:** Skim each acceptance criterion in the ticket. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

**4. Plan reliability:** Stress-test the plan before finalizing. Confirm that it contains no hidden assumptions, unexplained leaps, or decisions that contradict the ticket or source design. Fix any gaps or contradictions before saving the plan.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find an acceptance criterion with no task, add the task.

## Sync Back to Ticket and Source

After the plan is finalized, re-read the original `ticket.md` and the `Source` file referenced in its YAML frontmatter. If writing the plan led to new decisions, clarified requirements, or revealed inconsistencies with the ticket/source description, update the relevant documents so they stay aligned:

- Update `ticket.md` if the acceptance criteria, scope, user story, open questions, or next tickets need to reflect the clarified plan.
- Update the `Source` design/spec file if the design itself needs to be corrected or expanded to match the implementation direction.

Only make changes that are directly justified by the planning work. Do not expand scope or add speculative features.

## Execution Handoff

After saving the plan and syncing any updates back to the ticket/source, offer an execution choice:

**"Plan complete and saved to `tickets/NNN-<ticket-name>/plan.md`. Two execution options:**

**1. Subagent execution (recommended)** - Dispatch a fresh worker for each task and review each completed task

**2. Inline execution** - Track tasks with `todo` and execute them in this session with checkpoints

**Which approach?"**

For subagent execution, give each worker only its task and required context, then dispatch a reviewer before advancing. For inline execution, keep exactly one task `in_progress`, run every listed verification command, and stop at the plan's checkpoints.
