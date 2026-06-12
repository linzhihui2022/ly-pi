# my-todo Split Widget Design

## Goal

Split the current single `my-todo` widget into two independent widgets:

- **Active** (`my-todo`): tasks with status `pending` or `in_progress`.
- **Completed** (`my-todo-completed`): tasks with status `completed`.

A widget is hidden entirely when its category has no tasks. Each widget shows at most 3 tasks with an overflow hint.

## Motivation

The current single widget mixes active and completed tasks in one sorted list. Completed tasks push active tasks out of the limited display area, reducing visibility of work still in progress. Separating them keeps the active list focused while still surfacing recent completions.

## Behavior

### Widget IDs

| Widget | ID | Purpose |
|--------|----|---------|
| Active | `my-todo` | Keep the existing ID so current users experience no break. |
| Completed | `my-todo-completed` | New widget for finished tasks. |

### Content & Ordering

| Widget | Included statuses | Sort order |
|--------|-------------------|------------|
| Active | `in_progress`, `pending` | `in_progress` first, then `pending`. Within the same status, keep original insertion order (stable). |
| Completed | `completed` | Descending by `id`, so the most recently completed task appears first. |

Deleted tasks are never shown in either widget.

### Display Limits

- Each widget displays up to `MAX_VISIBLE = 3` tasks.
- If more tasks exist, append a final line `  +n more` (two leading spaces, dim color).
- If a category has zero tasks, do not render that widget at all.

### Rendering

#### Title

| Widget | Text | Style |
|--------|------|-------|
| Active | `Active (n)` | `accent` + `bold` |
| Completed | `Completed (n)` | `muted` + `bold` |

`n` is the total number of tasks in that category before truncation.

#### Task Lines

Format: `{symbol} #{id} {subject}`

| Status | Symbol | Color |
|--------|--------|-------|
| `pending` | `○` | `dim` |
| `in_progress` | `●` | `accent` |
| `completed` | `✓` | `muted` |

The Completed widget applies the `muted` color to every task line.

### Refresh Triggers

Same as today:

- `session_start`
- `turn_start`
- `turn_end`
- After any `todo` tool mutation (`create`, `update`, `delete`, `clear`)
- After `/todos` command mutations

`refreshOverlay(ctx)` must independently update both widgets:

1. Read `state.list()` (excludes deleted by default).
2. Split into `active` and `completed` arrays.
3. For each widget:
   - If the array is empty: `ctx.ui.setWidget(id, undefined)`.
   - Otherwise: register the widget with a renderer for that array.

## Implementation Approach

Use **Option A**: keep rendering logic in `overlay.ts` and add two entry points.

### `overlay.ts`

- Keep shared helpers: `STATUS_SYMBOLS`, `STATUS_COLORS`, `sortByPriority`, overflow rendering.
- Export `renderActiveOverlay(tasks, theme?)`:
  - Filter `pending`/`in_progress`.
  - Sort `in_progress → pending`.
  - Title `Active (n)`.
  - Apply per-status colors.
- Export `renderCompletedOverlay(tasks, theme?)`:
  - Filter `completed`.
  - Sort by `id` descending.
  - Title `Completed (n)`.
  - Apply `muted` color to all task lines.

### `index.ts`

- Replace `refreshOverlay` with logic that updates both widget IDs.
- Use `ctx.ui.setWidget("my-todo", activeRendererOrUndefined)`.
- Use `ctx.ui.setWidget("my-todo-completed", completedRendererOrUndefined)`.

## Testing

- Update `overlay.test.ts` to cover:
  - `renderActiveOverlay` filters and orders correctly.
  - `renderCompletedOverlay` filters and orders by `id` descending.
  - Each widget returns an empty array when the category is empty.
  - Overflow line appears after 3 tasks.
  - Title color/style matches the spec.
- Update `index.test.ts` (or equivalent integration tests) to verify both widgets are registered/hidden based on task state.

## Out of Scope

- New command-line options or `/todos` subcommands.
- Persistence changes; state continues to restore from session tool results.
- Changes to status transitions or task lifecycle.
- Visual Companion mockups (change is layout-only and text-based).

## Decisions Log

| Decision | Rationale |
|----------|-----------|
| Keep Active widget ID as `my-todo` | Backward compatibility; avoids surprising existing users. |
| Completed title uses `muted` | Completed work should not compete visually for attention. |
| Completed sorted by `id` descending | The largest id is the most recently created, so this approximates "recently completed first" without adding timestamps. |
| Each widget limit = 3 | User-specified; balances brevity with completeness. |
