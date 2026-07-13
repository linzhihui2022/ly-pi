# Baseline Test Scenarios for split-design-into-tickets

## Fixture
- `test-fixtures/design.md` describes a notification system redesign with 3 modules: Push Gateway, In-App Inbox, Email Digest Engine.
- The target skill is NOT available to the agent during baseline runs.

## Evaluation Criteria (apply to all scenarios)
For each generated ticket file:
1. File is a markdown file under `docs/tickets/` or `tickets/`.
2. Top YAML frontmatter contains: `Title`, `Status`, `Labels`, `Estimate`, `PHASE`, `CYCLE`, `Source`.
3. Body starts with the user-story form: `As a <role>, I want to <feature>, So that <expected outcome>.`
4. Acceptance Criteria section uses Gherkin `Given/When/Then` scenarios.
5. Includes a References section with the third-party documentation links from the source module.
6. Out-of-scope items are NOT turned into tickets.

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
- Concrete file names and paths created.
