# My Worktree Widget

**Status:** ready-for-agent

## Problem Statement

When a Pi session runs inside a Git repository with multiple worktrees, the user cannot see the other worktrees from the Pi interface. They need a compact, reliable view of the available worktrees without leaving the session or confusing ordinary single-worktree repositories with multi-worktree ones.

## Solution

Add an independent `my-worktree` widget to the unified ly-pi extension. In a multi-worktree repository, it displays every accessible worktree above the editor in Git's order as a Todo-style tree. A heading reports the visible count; each row shows the branch and path, with the current worktree distinguished by a symbol and theme color. The primary worktree root and its descendants abbreviate to `<REPO>`; worktrees elsewhere retain their absolute paths. The widget remains silent outside this eligible state. The later, separately invoked `/close-worktree` command belongs to the Worktree Manager; it does not make the widget mutating.

## User Stories

1. As a Pi user working in a multi-worktree repository, I want to see the available worktrees above the editor, so that I can keep their context visible while working.
2. As a Pi user, I want every accessible worktree to appear in the widget, so that I can see both the primary and auxiliary worktrees.
3. As a Pi user, I want the worktree containing my current session directory to be visibly marked, so that I can immediately identify my active location.
4. As a Pi user, I want each worktree row to show its branch and absolute path, so that similarly named worktrees remain distinguishable.
5. As a Pi user in a narrow terminal, I want a path representation that retains the path ending, so that the worktree-specific directory remains identifiable after truncation.
6. As a Pi user, I want the rows to preserve Git's reported order, so that the display is stable and familiar.
7. As a Pi user in a detached-HEAD worktree, I want to see a short commit identifier instead of a missing branch, so that the row remains useful.
8. As a Pi user, I want stale or inaccessible worktree records excluded, so that the widget does not advertise an unusable directory.
9. As a Pi user, I want the widget hidden when fewer than two worktrees remain visible, so that an ordinary repository does not gain irrelevant UI.
10. As a Pi user outside a Git repository or when Git discovery fails, I want no error UI, so that the Pi interface stays quiet and usable.
11. As a Pi user, I want the worktree information refreshed when a session starts and around each turn, so that it reflects changes made during my work without idle polling.
12. As a Pi user, I want this first version to be read-only, so that the widget provides orientation without unexpectedly changing my directory or session.
13. As a ly-pi maintainer, I want the widget to be an independent submodule of the unified extension, so that it has clear ownership without coupling to `my-hud`.
14. As a ly-pi maintainer, I want behavior verified at agreed data and widget seams, so that future refactors preserve the user-facing contract.

## Implementation Decisions

### Independent module ownership

`my-worktree` is an independent submodule registered by the existing unified ly-pi entry point. It is not a field, feature, or dependency of `my-hud`.

### Worktree snapshot contract

The data module obtains the Git worktree set for the repository containing the session working directory. It exposes the primary worktree root alongside the visible collection, excludes inaccessible and prunable records, identifies the current worktree from the session directory, preserves Git order, and represents detached HEAD entries with a short commit SHA.

### Visibility contract

The widget is eligible only when at least two visible worktrees exist. Non-Git directories, Git command failures, malformed output, and ineligible collections silently produce no widget.

### Rendering contract

The widget is placed above the editor as a Todo-style tree: an accent `Worktrees (N)` heading and `├─`/`└─` row connectors. Each visible worktree row contains its branch or detached-HEAD identifier and path. The primary worktree root is `<REPO>` and its descendants begin `<REPO>/`; a worktree outside that path remains absolute. The current row uses an accent solid marker; other rows use a dim hollow marker. At limited width, rendering truncates the beginning of the path so its ending remains visible.

### Refresh contract

The worktree snapshot refreshes at session startup and at the beginning and end of each Pi turn. The widget itself does not create an idle timer, filesystem watcher, selector, or worktree-switching behavior. The separately documented `/close-worktree` command is the sole approved manager operation and does not alter the widget's read-only behavior.

### Configuration and special state scope

The initial release has no user configuration. Locked but accessible worktrees remain ordinary visible worktrees; no extra Git status, dirty-state, or lock indicator is added.

## Testing Decisions

### What makes a good test

Tests observe the agreed public behavior at the same seams used by callers. They assert known worktree inputs and visible widget output rather than private caches, parsing loops, or internal state.

### Data seam

Tests cover the public worktree snapshot behavior: ordinary branch records, detached-HEAD identifiers, prunable or inaccessible records, Git order, current-worktree selection, and the two-visible-worktree threshold.

### Widget seam

Tests cover the extension's public Pi integration: widget registration above the editor, startup and turn refresh behavior, silent hiding, current-row marking, and width-safe path rendering.

### Prior art

The existing ly-pi widget tests use mocked Pi extension contexts and theme callbacks. The existing Git status helpers demonstrate pure Git output parsing alongside UI lifecycle verification. New tests follow those patterns while remaining tied to the two agreed seams.

### TDD loop

Implementation proceeds in small red-green slices: first a failing behavior test at one agreed seam, then the minimum implementation to pass it, before moving to the next behavior.

## Out of Scope

- Changing `my-hud`
- Worktree selection, directory switching, session switching, or interactive controls
- A manual refresh command
- Idle polling or filesystem watchers
- Git dirty-state, stash, lock, PR, or other status details
- User configuration for placement, formatting, or refresh timing
- Showing inaccessible or prunable worktree records
- Widget-initiated changes to Git repositories or worktree management commands; the separately documented `/close-worktree` manager operation is the sole approved exception

## Further Notes

- The established domain vocabulary in `CONTEXT.md` defines Multi-worktree Repository, Current Worktree, Visible Worktree, and Worktree Widget for this feature.
- The module and UI policy are local and reversible, so no ADR is needed.
- Completion requires the repository's full `bun run verify` validation and the normal deploy-and-reload flow for the Pi extension.
