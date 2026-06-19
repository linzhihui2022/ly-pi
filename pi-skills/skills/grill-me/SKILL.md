---
name: grill-me
description: Use when a plan, design, architecture, or feature direction feels fuzzy, underspecified, or risky; when the user says "grill me", "stress-test this", or "challenge my plan"; when previous implementation attempts missed hidden assumptions.
---

# Grill Me

Stress-test a plan by interviewing the user relentlessly until every branch of the decision tree is resolved.

## Overview

`grill-me` asks questions — one at a time — until you and the user share the same mental model. Unlike `brainstorming`, it assumes the user already has a direction and wants it challenged.

## When to Use

Use when the user says "grill me", a plan is vague, or previous work missed "obvious" requirements. Do NOT use when there is no plan at all — use `brainstorming` — or when coding from a clear spec — use `writing-plans`.

## Hard Gate

Do NOT write code, scaffold files, or invoke implementation skills until the user explicitly confirms the plan is clear and complete.

## Process

Announce at start: "I'm using the `grill-me` skill to stress-test this plan. I'll ask you questions one at a time until we both agree on what we're building."

Create a `todo`:

```
todo create: subject="Grill me: resolve decision tree", status=in_progress
```

### The Loop

1. **Explore the codebase first.** If the answer exists in code, docs, CONTEXT.md, ADRs, or commits, use it instead of asking.
2. **Ask one question at a time.** Walk down one branch per question. Focus on dependencies: "Before we pick X, we need to decide Y."
3. **Provide a recommended answer.** Mark it "(Recommended)" if using `ask_user_question`.
4. **Record the decision.** Keep a running summary.
5. **Repeat until no open branches remain.**
6. **Produce a final summary:** scope, constraints, decisions, open questions, success criteria.

Use `ask_user_question` for 2–4 option questions. For open-ended questions, ask in plain text — still one question per message.

Tactics: resolve dependencies first, challenge defaults, surface edge cases, define done numerically, identify the human in the flow.

## End State

After the user confirms the plan is clear:

- Hand off to `writing-plans` if a design/spec needs formalizing
- Hand off to `executing-plans` or `subagent-driven-development` for small, immediate tasks
- Stop if the user only wanted clarity

Then mark the todo complete.

## Quick Reference

| Situation | Do this |
|---|---|
| User says "grill me" | Announce skill; create todo |
| 2–4 clear options | Use `ask_user_question`; recommended first |
| Answer is in the codebase | Explore code/docs instead of asking |
| User corrects recommendation | Update summary; continue down that branch |
| No more open branches | Final summary; ask if plan is clear |
| Plan is clear | Hand off to `writing-plans` or `executing-plans` |

## Common Mistakes

- Asking multiple questions at once
- Skipping the recommended answer
- Letting the user hand-wave with "we'll figure it out later"
- Grilling forever once the tree is resolved
- Writing code before the plan is confirmed

## Red Flags — STOP and Refocus

- About to write a file before the user confirms the plan
- User has not agreed with your summary
- Asking three questions in one message
- Ignoring an answer the codebase could provide
- Session has become generic chat instead of decision-tree walk
