---
name: split-design-into-tickets
description: Use when a user asks to split a design document or spec into Linear-style markdown tickets, or when breaking a design.md into actionable implementation tickets.
---

# Split Design into Tickets

## Overview

Convert a single design document into a set of markdown ticket files. Each ticket maps to one implementation unit from the design, uses a consistent YAML metadata block, and keeps acceptance criteria in Gherkin form.

## When to Use

Use this skill when:
- The user says "split", "break down", or "convert" a `design.md`, `spec.md`, or similar design document into tickets.
- The target format is Linear-style markdown tickets.
- The user wants implementation-ready tickets derived from an existing design.

Do NOT use for:
- Creating a single design document from scratch (write the design, not tickets).
- Jira, GitHub Issues, or other ticket formats unless the user explicitly asks for the Linear-style markdown ticket format described here.

## Output Location

Place generated tickets in a `tickets/` directory. Use this precedence:
1. `docs/tickets/` if the project already has a `docs/` directory.
2. `tickets/` at the project root otherwise.

Never put ticket files directly next to the source design file unless the user explicitly requests it.

## Ticket File Format

### 1. One ticket per implementation unit

- Map each distinct module, feature, or work item in the design to exactly one ticket file.
- Do NOT create an extra "epic" or "parent" ticket unless the design itself explicitly defines one.
- Do NOT turn "Out of Scope" items into tickets.

### 2. YAML frontmatter (required)

Each file starts with YAML frontmatter using exactly these fields:

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

- `Status` is always `TODO` for new tickets.
- `Labels` come from the design module or inferred categories (e.g., `backend, push-notifications`).
- `Estimate` is one of `1`, `2`, `3`, `5`, `8`, `13`. If the design lacks sizing, infer from scope and note it briefly to the user.
- `Depends` lists comma-separated ticket titles that must be completed before this ticket. If there are no dependencies, leave it empty.
- `PHASE` and `CYCLE` are sequential numbers. If the design does not define phases/cycles, default to `PHASE: 1` and `CYCLE: 1` for all tickets.
- `Source` is the relative path to the design file the ticket was generated from (e.g., `docs/design.md`, `design.md`).

Do not add extra fields like `id`, `priority`, `assignee`, or `parent` unless the user specifically requests them. `Depends` is the only optional dependency field.

### 3. Body structure

After the frontmatter, the body must follow this exact order:

```markdown
# <Title repeated>

## User Story

As a <role>, I want <feature>, So that <expected outcome>.

## Acceptance Criteria

### Scenario 1: <name>

Given <context>
When <action>
Then <expected result>

### Scenario 2: <name>

...

## References

- <link title or description>(<url>)
```

#### User Story rules
- Use the exact sentence form: `As a <role>, I want <feature>, So that <expected outcome>.`
- If the design only provides one global user story, reuse it for every ticket. Do not invent a different user story per ticket.
- If the design lacks a user story, derive one from the module's purpose and keep the same form.

#### Acceptance Criteria rules
- Convert every acceptance criterion from the design into a Gherkin `Given/When/Then` scenario.
- Use one scenario per criterion. If a criterion is multi-part, split it into multiple scenarios.
- Do not leave acceptance criteria as plain bullet points or checkboxes.

#### References rules
- Include every third-party documentation link mentioned in the corresponding design module.
- If the module has no links, omit the References section entirely; do not add links not present in the design.

## File Naming

Use kebab-case and a sequential prefix:

```
tickets/001-<module-name>.md
tickets/002-<module-name>.md
```

If the project already numbers design sections, reuse those numbers for the prefix.

## Common Mistakes

| Mistake | Fix |
|--------|-----|
| "No time for Gherkin, I'll use bullets" | Acceptance criteria must be Gherkin scenarios. This is non-negotiable. |
| "The user wants Jira format" | Unless the user explicitly rejects the Linear-style format, follow this skill. If they reject it, do not use this skill. |
| "I'll add an epic ticket for grouping" | Do not create parent/epic tickets unless the design explicitly defines one. |
| "Out of Scope items should still be tracked" | Do not turn out-of-scope items into tickets. |
| "I'll add Implementation Notes to be helpful" | Do not add sections not in the design. Stick to User Story, Acceptance Criteria, and References. |
| "I'll put files next to the design doc" | Use `docs/tickets/` or `tickets/` at project root. |

## Red Flags — STOP and Re-read This Skill

- You are about to skip YAML frontmatter.
- You are about to use bullet points instead of Gherkin.
- You are about to create an epic or parent ticket.
- You are about to place ticket files next to the design source.
- The user asked for a different format and you are still applying this skill.

## Example

Source design module:

```markdown
### 2. In-App Inbox

Build a persistent inbox where users can view, archive, and mark notifications as read.

**Acceptance Criteria:**
- Users can paginate through inbox items with 50ms response time.
- Read/archive state syncs across devices.
- Unread count badge updates in real time.

**Related Documents:**
- https://reactnative.dev/docs/flatlist
```

Generated ticket (`tickets/002-in-app-inbox.md`):

```markdown
---
Title: In-App Inbox
Status: TODO
Labels: frontend, mobile, notifications
Estimate: 5
Depends: Push Notification Service
PHASE: 1
CYCLE: 1
Source: design.md
---

# In-App Inbox

## User Story

As a user, I want to view and manage my notifications in one place, So that I can stay informed without being overwhelmed.

## Acceptance Criteria

### Scenario 1: Paginate inbox items

Given the user has notifications in their inbox
When the user scrolls through the inbox
Then items are paginated and each page loads within 50ms

### Scenario 2: Sync read and archive state

Given the user is signed in on multiple devices
When the user reads or archives a notification on one device
Then the state is reflected on all devices

### Scenario 3: Update unread badge

Given the user has unread notifications
When a new notification arrives or the user marks one as read
Then the unread count badge updates in real time

## References

- [React Native FlatList](https://reactnative.dev/docs/flatlist)
```
