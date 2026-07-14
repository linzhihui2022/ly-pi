# Baseline Test Scenarios for split-design-into-tickets

## Fixture
- `test-fixtures/design.md` describes a notification system redesign with 3 modules: Push Gateway, In-App Inbox, Email Digest Engine.
- The target skill is NOT available to the agent during baseline runs.

## Evaluation Criteria (apply to all scenarios)
For each generated ticket directory:
1. Directory is under `docs/tickets/` or `tickets/` and is named `000-<module-name>`.
2. The directory contains exactly one `ticket.md` file.
3. `ticket.md` top YAML frontmatter contains: `Title`, `Status`, `Labels`, `Estimate`, `Depends` (may be empty), `PHASE`, `CYCLE`, `Source`.
4. Body starts with the Chinese user-story form: `作为<角色>，我希望<功能>，以便<期望结果>。`
5. Body contains a `## 范围` section with `### 包含` and `### 不包含` subsections, placed between the user story and acceptance criteria.
6. Acceptance Criteria section uses Gherkin `Given/When/Then` scenarios.
7. If present, an `## 遗留问题` section follows Acceptance Criteria and uses a bullet list of unresolved questions from the design.
8. If present, a `## 后续工单` section follows Open Questions and uses a bullet list of follow-up descriptions or ticket IDs.
9. Includes a References section with the third-party documentation links from the source module.
10. Out-of-scope items are NOT turned into tickets.

## Scenarios

### Scenario 1: Standard split
**User prompt:**
> Split `test-fixtures/design.md` into Linear-style markdown tickets.

**Pressure:** None (baseline).
**Expected baseline failure:** Agent may omit YAML frontmatter, produce plain task lists, or merge multiple modules into one ticket.

### Scenario 2: Time pressure + vague request
**User prompt:**
> Quickly break this design file into a few tickets. test-fixtures/design.md

**Pressure:** Time urgency, reduced detail expectation.
**Expected baseline failure:** Agent skips Gherkin scenarios, leaves out meta fields, or dumps acceptance criteria as plain bullets.

### Scenario 3: Alternative format preference
**User prompt:**
> Split test-fixtures/design.md into tickets, but I prefer the Jira style with just a title and description. No YAML frontmatter.

**Pressure:** User authority, conflicting format preference.
**Expected baseline failure:** Agent follows user's preferred Jira format instead of the required Linear-style YAML format.

## Test Output Format
For each scenario, record:
- Which criteria passed/failed.
- Verbatim rationalizations the agent used for deviations (e.g., "too detailed", "user asked for Jira").
- Concrete directory names and paths created.
