---
name: requesting-code-review
description: Use when completing tasks, implementing major features, before merging to verify work meets requirements, or when user sends a GitHub PR link / pull request URL to request code review
---

# Requesting Code Review

Dispatch a code reviewer subagent to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history. This keeps the reviewer focused on the work product, not your thought process, and preserves your own context for continued work.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**
- After each task in subagent-driven development
- After completing major feature
- Before merge to main

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Get git SHAs:**
```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

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

**Placeholders:**
- `{DESCRIPTION}` - Brief summary of what you built
- `{PLAN_OR_REQUIREMENTS}` - What it should do
- `{BASE_SHA}` - Starting commit
- `{HEAD_SHA}` - Ending commit

**3. Act on feedback:**
- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- Push back if reviewer is wrong (with reasoning)

## Example

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

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

[Subagent returns]:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed

You: [Fix progress indicators]
[Continue to Task 3]
```

## Integration with Workflows

**Subagent-Driven Development:**
- Review after EACH task
- Catch issues before they compound
- Fix before moving to next task

**Executing Plans:**
- Review after each task or at natural checkpoints
- Get feedback, apply, continue

**Ad-Hoc Development:**
- Review before merge
- Review when stuck

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback

**If reviewer wrong:**
- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

See template at: requesting-code-review/code-reviewer.md
