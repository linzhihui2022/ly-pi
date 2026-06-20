# my-ask Requirements

## Goal

Build a local Pi extension (`pi-extensions/my-ask`) that registers the tool `ask_user_question` as a drop-in replacement for `@juicesharp/rpiv-ask-user-question`.

## Must have

- Tool name `ask_user_question` with the original schema shape:
  - `questions[]` (1–4 items)
  - each question has `question`, `header` (≤16 chars), `options` (2–4 items), optional `multiSelect`
  - each option has `label` (≤60 chars), `description`, optional `preview`
- Runtime validation with error codes:
  - `no_ui`, `no_questions`, `too_many_questions`, `empty_options`, `duplicate_question`, `duplicate_option_label`, `reserved_label`
- Guard execution with `ctx.hasUI` so the tool fails gracefully in non-interactive/print modes
- Reserved option labels blocked at validation:
  - `Other`, `Type something.`, `Chat about this`, `Next`
- UI behaviors:
  - question text wraps to multiple lines instead of being truncated with an ellipsis when it exceeds the available width
  - single-select option list
  - automatic "Type something." row on questions without preview
  - inline editor when "Type something." is selected
  - custom input is added to the option list as a new row `<value> (custom)`; it is not submitted automatically
  - custom rows behave like standard options: Enter selects/submits them, Space toggles them in multi-select
  - Delete/Backspace removes a focused custom row
  - single-select: after adding a custom value the user must press Enter on that row (or another option) to finalise the answer
  - multi-select with Space toggle and Enter submit
  - press `a` in multi-select to select all current rows (preset options + existing custom rows); press `a` again to clear all selections
  - "Type something." row also available on multi-select; input is appended to the current selections as a visible checked row `[x] <value> (custom)`
  - preview rendered below the focused option on single-select, capped to a small height and without excessive padding
  - "Chat about this" escape row on every question
  - multi-question tab bar with ←→/Tab navigation and a Submit tab
  - Esc cancels the whole questionnaire
- Result envelope compatible with the original:
  - `details.answers[]` with `questionIndex`, `question`, `kind`, `answer`, optional `selected`, optional `preview`
  - `details.cancelled` and optional `details.error`
  - human-readable `content[0].text`
- Register `promptSnippet` and `promptGuidelines` so the LLM sees the tool in the available-tools list
- TDD: tests before implementation; `validate.ts`/`format.ts`/`questionnaire.ts` reach 100% coverage
- Build via `bunx turbo run build`, deploy via `bun run deploy` to `~/.pi/agent/extensions/my-ask`

## Must not

- Depend on `@juicesharp/rpiv-*`
- Add i18n, external event notifications, configurable guidance, or side-by-side preview panes
- Include per-option notes (the original has them; this simplified version omits them)

## Out of scope

- Replacing or uninstalling the original extension automatically (documented in SPEC.md but done by the user)
- Custom `renderCall`/`renderResult` tool rendering (use Pi defaults)
