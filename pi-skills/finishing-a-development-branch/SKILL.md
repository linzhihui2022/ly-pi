---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting structured options for merge, PR, or cleanup
---

# Finishing a Development Branch

## Overview

Guide completion of development work by presenting clear options and handling chosen workflow.

**Core principle:** Verify tests → Detect environment → Present options → Execute choice → Clean up.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## The Process

At the start of the workflow, create a `todo` task for each step:

```
todo create: subject="Verify tests", status=pending
todo create: subject="Detect environment", status=pending, blockedBy=[id1]
todo create: subject="Present options", status=pending, blockedBy=[id2]
todo create: subject="Execute choice", status=pending, blockedBy=[id3]
todo create: subject="Clean up", status=pending, blockedBy=[id4]
```

Mark each `in_progress` before beginning work, `completed` when done.

---

### Step 1: Verify Tests

**Before presenting options, verify tests pass:**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**If tests fail:**
```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot proceed with merge/PR until tests pass.
```

Stop. Don't proceed to Step 2.

**If tests pass:** Continue to Step 2.

---

### Step 2: Detect Environment

**Determine workspace state before presenting options:**

```bash
# Check if we're on a detached HEAD
git symbolic-ref -q HEAD >/dev/null 2>&1 && echo "named" || echo "detached"
```

This determines which menu to show:

| State | Menu |
|-------|------|
| Named branch | Standard 4 options |
| Detached HEAD | Reduced 3 options (no merge) |

---

### Step 3: Determine Base Branch

```bash
# Try common base branches
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

Or ask: "This branch split from main - is that correct?"

---

### Step 4: Present Options

**Use `ask_user_question` for structured option presentation.**

**Named branch — present exactly these 4 options:**

```
ask_user_question:
  question: "Implementation complete. What would you like to do?"
  options:
    - label: "Merge back to <base-branch> locally"
      description: "Checkout base branch, pull, merge feature branch, verify tests, then delete branch."
    - label: "Push and create a Pull Request"
      description: "Push branch to origin and open a PR with summary and test plan."
    - label: "Keep the branch as-is (I'll handle it later)"
      description: "Leave branch untouched."
    - label: "Discard this work"
      description: "Permanently delete the branch and all its commits. Requires confirmation."
```

**Detached HEAD — present exactly these 3 options:**

```
ask_user_question:
  question: "Implementation complete. You're on a detached HEAD."
  options:
    - label: "Push as new branch and create a Pull Request"
      description: "Create a new branch from detached HEAD, push, and open a PR."
    - label: "Keep as-is (I'll handle it later)"
      description: "Leave the detached HEAD state as-is."
    - label: "Discard this work"
      description: "Abandon the current state. Requires confirmation."
```

**Don't add explanation** - keep options concise.

---

### Step 5: Execute Choice

#### Option 1: Merge Locally

```bash
# Merge first — verify success before removing anything
git checkout <base-branch>
git pull
git merge <feature-branch>

# Verify tests on merged result
<test command>
```

Only after merge succeeds: delete branch:

```bash
git branch -d <feature-branch>
```

#### Option 2: Push and Create PR

```bash
# Push branch
git push -u origin <feature-branch>

# Create PR
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

#### Option 3: Keep As-Is

Report: "Keeping branch <name>. No cleanup performed."

#### Option 4: Discard

**Confirm first using `ask_user_question`:**

```
ask_user_question:
  question: "This will permanently delete branch <name> and all its commits. Type 'discard' to confirm."
  options:
    - label: "discard"
      description: "Permanently delete the branch. This cannot be undone."
    - label: "cancel"
      description: "Keep the branch and abort discard."
```

Wait for exact confirmation. If confirmed:

```bash
git branch -D <feature-branch>
```

---

### Step 6: Clean Up

**Only runs for Options 1 and 4.** Options 2 and 3 always preserve the branch.

For Option 1: branch already deleted during merge step.

For Option 4: branch already force-deleted during confirmation step.

No additional cleanup needed in Pi (no worktrees to manage).

---

## Quick Reference

| Option | Merge | Push | Keep Branch | Delete Branch |
|--------|-------|------|-------------|---------------|
| 1. Merge locally | yes | - | - | yes |
| 2. Create PR | - | yes | yes | - |
| 3. Keep as-is | - | - | yes | - |
| 4. Discard | - | - | - | yes (force) |

## Common Mistakes

**Skipping test verification**
- **Problem:** Merge broken code, create failing PR
- **Fix:** Always verify tests before offering options

**Open-ended questions**
- **Problem:** "What should I do next?" is ambiguous
- **Fix:** Present exactly 4 structured options (or 3 for detached HEAD) via `ask_user_question`

**Cleaning up branch for Option 2**
- **Problem:** Delete branch user needs for PR iteration
- **Fix:** Only delete branch for Options 1 and 4

**Deleting branch before confirming merge success**
- **Problem:** Branch gone but merge failed
- **Fix:** Merge first, verify tests, then delete branch

**No confirmation for discard**
- **Problem:** Accidentally delete work
- **Fix:** Require typed "discard" confirmation via `ask_user_question`

## Red Flags

**Never:**
- Proceed with failing tests
- Merge without verifying tests on result
- Delete work without confirmation
- Force-push without explicit request

**Always:**
- Verify tests before offering options
- Detect environment before presenting menu
- Present exactly 4 options (or 3 for detached HEAD)
- Get typed confirmation for Option 4
