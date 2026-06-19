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

# Check if a remote is configured
git remote -v >/dev/null 2>&1 && git remote | head -n1 | grep -q . && echo "has-remote" || echo "no-remote"
```

This determines which menu to show:

| Branch state | Remote state | Menu |
|--------------|--------------|------|
| Named branch | Has remote | Standard 5 options |
| Named branch | No remote | Local-only 4 options (no push/PR) |
| Detached HEAD | Has remote | Reduced 3 options (can push as new branch) |
| Detached HEAD | No remote | Local-only 2 options (keep or discard) |

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

**Named branch with remote — present exactly these 5 options:**

```
ask_user_question:
  question: "Implementation complete. What would you like to do?"
  options:
    - label: "Batch commit, push, and create PR"
      description: "Split changes into logical commits, push to remote, then open a Pull Request."
    - label: "Batch commit and push"
      description: "Split changes into logical commits, push to remote. No PR."
    - label: "Batch commit only"
      description: "Split changes into logical commits, keep local. No push, no PR."
    - label: "Do nothing"
      description: "Leave the working tree untouched — no commit, push, or PR."
    - label: "Rollback uncommitted changes"
      description: "Discard all uncommitted changes in the working tree. Requires confirmation."
```

**Named branch without remote — present exactly these 3 options:**

```
ask_user_question:
  question: "Implementation complete. No remote is configured. What would you like to do?"
  options:
    - label: "Batch commit only"
      description: "Split changes into logical commits, keep local. No push, no PR."
    - label: "Do nothing"
      description: "Leave the working tree untouched — no commit, push, or PR."
    - label: "Rollback uncommitted changes"
      description: "Discard all uncommitted changes in the working tree. Requires confirmation."
```

**Detached HEAD with remote — present exactly these 3 options:**

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

**Detached HEAD without remote — present exactly these 2 options:**

```
ask_user_question:
  question: "Implementation complete. You're on a detached HEAD and no remote is configured."
  options:
    - label: "Keep as-is (I'll handle it later)"
      description: "Leave the detached HEAD state as-is."
    - label: "Discard this work"
      description: "Abandon the current state. Requires confirmation."
```

**Don't add explanation** - keep options concise.

---

### Step 5: Execute Choice

#### Option 1: Batch commit, push, and create PR

Analyze the working tree, group changes logically (e.g. by feature, file type, or directory), `git add` and `git commit -m "..."` in batches to produce multiple focused commits. Then push the branch to remote.

```bash
# Push branch
git push -u origin <feature-branch>
```

Open a Pull Request separately if needed (e.g. via `gh pr create` or the GitHub web UI).

#### Option 2: Batch commit and push

Analyze the working tree, group changes logically into multiple commits. Push the branch to remote, but do **not** create a PR.

```bash
git push -u origin <feature-branch>
```

Report: "Batched commits pushed to remote branch <name>. No PR created."

#### Option 3: Batch commit only

Analyze the working tree, group changes logically into multiple commits. Keep everything local — no push, no PR.

Report: "Batched commits created on local branch <name>. No push, no PR."

#### Option 4: Do nothing

Report: "Keeping branch <name> as-is. No action taken."

#### Option 5: Rollback uncommitted changes

**Confirm first using `ask_user_question`:**

```
ask_user_question:
  question: "This will discard all uncommitted changes in the working tree. Type 'rollback' to confirm."
  options:
    - label: "rollback"
      description: "Permanently discard uncommitted changes. This cannot be undone."
    - label: "cancel"
      description: "Keep uncommitted changes and abort rollback."
```

Wait for exact confirmation. If confirmed:

```bash
git checkout -- .
git clean -fd
```

---

### Step 6: Clean Up

**No cleanup needed.** Options 1–4 preserve the branch. Option 5 only discards uncommitted changes; the branch itself remains intact.

No additional cleanup needed in Pi (no worktrees to manage).

---

## Quick Reference

| Option | Merge | Push | Keep Branch | Delete Branch |
|--------|-------|------|-------------|---------------|
| 1. Batch commit, push, PR | - | yes | yes | - |
| 2. Batch commit, push | - | yes | yes | - |
| 3. Batch commit only | - | - | yes | - |
| 4. Do nothing | - | - | yes | - |
| 5. Rollback changes | - | - | yes | - |

## Common Mistakes

**Skipping test verification**
- **Problem:** Merge broken code, create failing PR
- **Fix:** Always verify tests before offering options

**Open-ended questions**
- **Problem:** "What should I do next?" is ambiguous
- **Fix:** Present exactly 5 structured options (or 3 for detached HEAD) via `ask_user_question`

**Single giant commit instead of batch commits**
- **Problem:** One commit mixes unrelated changes, making review and rollback harder
- **Fix:** Group changes logically (feature, file type, or directory) into multiple focused commits

**No confirmation for rollback**
- **Problem:** Accidentally discard uncommitted work
- **Fix:** Require typed "rollback" confirmation via `ask_user_question`

## Red Flags

**Never:**
- Proceed with failing tests
- Delete work without confirmation
- Force-push without explicit request

**Always:**
- Verify tests before offering options
- Detect environment before presenting menu
- Present exactly 5 options (or 3 for detached HEAD)
- Get typed confirmation for Option 5
