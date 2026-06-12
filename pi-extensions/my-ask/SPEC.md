# my-ask Spec

> Status: confirmed as implementation baseline  
> Confirmed date: 2026-06-12  
> Goal: build a local `my-ask` extension that replaces `@juicesharp/rpiv-ask-user-question`.

## 1. Design philosophy

- **Drop-in replacement**: keep the original tool name `ask_user_question` and schema so prompts do not need to change after uninstalling the original.
- **Minimal dependencies**: only Pi SDK (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`) and `typebox`.
- **TDD**: write tests first; pure functions and the questionnaire state machine target 100% coverage.
- **Maintainable**: clear module boundaries and one-way dependencies; UI starts as a simple top/bottom list layout.

## 2. Module layout

```
pi-extensions/my-ask/
├── index.ts              # extension entry point: register ask_user_question
├── types.ts              # typebox schemas + result types
├── validate.ts           # parameter validation (pure function)
├── format.ts             # assemble user answers into LLM-facing text
├── questionnaire.ts      # custom TUI component (core interaction)
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── SPEC.md               # this document
├── REQUIREMENTS.md       # requirement checklist
└── scripts/deploy.ts     # deploy to ~/.pi/agent/extensions/my-ask
```

Dependency direction:

```
index.ts → questionnaire.ts → types.ts
         → validate.ts ──────┘
         → format.ts ────────┘
```

`questionnaire.ts` is rendered through `ctx.ui.custom` and does not depend on `index.ts` event registration.

## 3. Tool definition

### 3.1 Tool name

`ask_user_question`

### 3.2 Schema

```ts
const OptionSchema = Type.Object({
  label: Type.String({ maxLength: 60 }),
  description: Type.String(),
  preview: Type.Optional(Type.String()),
});

const QuestionSchema = Type.Object({
  question: Type.String(),
  header: Type.String({ maxLength: 16 }),
  options: Type.Array(OptionSchema, { minItems: 2, maxItems: 4 }),
  multiSelect: Type.Optional(Type.Boolean({ default: false })),
});

const QuestionParamsSchema = Type.Object({
  questions: Type.Array(QuestionSchema, { minItems: 1, maxItems: 4 }),
});
```

### 3.3 Limits

| Item | Limit |
|---|---|
| Max questions per call | 4 |
| Min options per question | 2 |
| Max options per question | 4 |
| Max header length | 16 |
| Max label length | 60 |
| Preview | single-select only; suppresses "Type something." but keeps "Chat about this" |

### 3.4 Reserved labels

These option labels are rejected by validation:

- `Other`
- `Type something.`
- `Chat about this`
- `Next`

### 3.5 Prompt metadata

The tool registers a `promptSnippet` and `promptGuidelines` so the LLM sees it in the available-tools list and knows when and how to use it, matching the original extension.

## 4. UI design

### 4.1 Top/bottom list layout

```
──────────────────────────────────
 Which layout should we use?  [Layout]
──────────────────────────────────

> 1. Vertical list
     A simple top-question, bottom-options layout.
  2. Side-by-side
     Left options, right preview pane.
  3. Chat about this

 ↑↓ navigate • Enter select • Esc cancel
──────────────────────────────────
```

### 4.2 Multi-question navigation

When there are multiple questions, a tab bar is shown at the top:

```
← □ Q1  ■ Q2  □ Q3  ✓ Submit →
```

- Answered questions show `■`; unanswered show `□`.
- `Tab` / `←` / `→` switch tabs.
- On the Submit tab, pressing Enter submits if every question is answered.

### 4.3 Preview expansion

For single-select questions that contain a `preview` on any option, the focused option’s markdown preview is rendered below the list:

```
> 1. Option A
     Description for A.

 Preview:
 ┌────────────────────────────┐
 │ # Sample config            │
 │ value = 42                 │
 └────────────────────────────┘
```

Preview suppresses the "Type something." row.

### 4.4 Custom input

On single-select questions without preview, the list ends with an automatic "Type something." row. Selecting it opens an inline editor:

```
 Your answer:
 [inline editor]
 Enter to submit • Esc to go back
```

### 4.5 Multi-select

Multi-select questions use checkboxes:

```
> ☐ Option A
  ☐ Option B
  ☑ Option C

 Space toggle • Enter submit
```

No "Type something." row is shown.

## 5. Navigation

| Key | Action |
|---|---|
| `↑` / `↓` | move option focus |
| `Tab` / `→` / `←` | switch question tabs (multi-question only) |
| `Enter` | select focused option; submit custom input; submit on Submit tab |
| `Space` | toggle checkbox in multi-select |
| `Esc` | cancel the questionnaire, or exit custom-input mode |

## 6. Errors and return values

### 6.1 Return structure

```ts
interface QuestionAnswer {
  questionIndex: number;
  question: string;
  kind: "option" | "custom" | "chat" | "multi";
  answer: string | null;
  selected?: string[];
  preview?: string;
}

interface QuestionnaireResult {
  answers: QuestionAnswer[];
  cancelled: boolean;
  error?: QuestionnaireError;
}
```

### 6.2 Error codes

- `no_ui` — `ctx.hasUI` is false (not running in an interactive/RPC UI context)
- `no_questions` — no questions provided
- `too_many_questions` — more than 4 questions
- `empty_options` — fewer than 2 options in a question
- `duplicate_question` — duplicate question text
- `duplicate_option_label` — duplicate option label within a question
- `reserved_label` — option label is reserved

### 6.3 Tool result text

- Completed: `User has answered your questions: "Q"="A". ... You can now continue with the user's answers in mind.`
- Cancelled / no answers: `User declined to answer questions`

## 7. Testing

| Module | Test style | Coverage target |
|---|---|---|
| `validate.ts` | pure function unit tests | 100% |
| `format.ts` | pure function unit tests | 100% |
| `questionnaire.ts` | mocked TUI/Editor state-machine tests | 100% |
| `index.ts` | mocked `ExtensionAPI` integration | excluded |
| `types.ts` | type definitions only | excluded |

Key scenarios:

1. single-select + custom input
2. multi-select completion
3. preview single-select
4. user cancellation
5. non-UI mode error
6. validation failures (question count, options, duplicates, reserved labels)
7. multi-question tab navigation and submit

## 8. Deployment

1. `bunx turbo run build` → `dist/index.js`
2. `bun run deploy` copies `dist/index.js` to `~/.pi/agent/extensions/my-ask/index.js`
3. In Pi run `/reload`
4. Uninstall the original with `pi uninstall @juicesharp/rpiv-ask-user-question` to avoid name collisions

## 9. Excluded features

| Feature | Reason |
|---|---|
| i18n | local use; English UI is sufficient |
| External event notifications | not needed |
| Configurable guidance snippets | not needed |
| Side-by-side preview panes | start with simple top/bottom preview |
| Per-option notes | omitted for simplicity |

## 10. Changelog

| Date | Change |
|---|---|
| 2026-06-12 | confirmed replacement approach, schema, UI layout, and testing strategy |
