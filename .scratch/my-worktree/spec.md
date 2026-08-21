# My Worktree Widget

**Status:** ready-for-agent

## Problem Statement

When a Pi session runs inside a Git repository with multiple worktrees, listing every peer worktree above the editor is redundant. The user needs a compact, reliable indication of the Current Worktree without exposing the identities of other worktrees or confusing ordinary single-worktree repositories with multi-worktree ones.

## Solution

Add an independent `my-worktree` widget to the unified ly-pi extension. In an eligible multi-worktree repository, it renders exactly two Todo-style lines: an accent `● Worktrees (N)` heading and one neutral `└─ •` Current Worktree row. `N` is the number of all visible worktrees, including the current one, but no peer branch or path is rendered. The row shows the current branch or detached-HEAD short SHA and worktree root path. Primary-repository paths abbreviate to `<REPO>`; external paths remain absolute. The widget silently hides outside its eligible state, when Current Worktree cannot be uniquely identified, or when no path width remains. The later, separately invoked `/close-worktree` command belongs to the Worktree Manager; it does not make the widget mutating.

## User Stories

1. As a Pi user working in a multi-worktree repository, I want to see only my Current Worktree above the editor, so that peer worktrees do not add redundant context.
2. As a Pi user, I want the heading to report the total visible-worktree count without enumerating peer branches or paths, so that I retain aggregate context without a worktree list.
3. As a Pi user, I want the single row to show my branch and worktree root path, so that I can identify my active location.
4. As a Pi user in a nested worktree, I want the deepest worktree containing my session directory to be shown, so that the indicator names the most specific active location.
5. As a Pi user in a narrow terminal, I want the path ending retained when space permits and the widget hidden when no path character fits, so that the indicator is never reduced to a misleading branch-only row.
6. As a Pi user in a detached-HEAD worktree, I want to see a short commit identifier instead of a missing branch, so that the row remains useful.
7. As a Pi user, I want stale or inaccessible worktree records excluded and at least two visible worktrees required, so that the aggregate count and eligibility are reliable.
8. As a Pi user outside a Git repository, when discovery fails, or when no unique Current Worktree exists, I want no error UI, so that the Pi interface stays quiet and usable.
9. As a Pi user, I want the indicator refreshed when a session starts and around each turn, so that it reflects current-worktree changes without idle polling.
10. As a Pi user, I want this first version to be read-only, so that the widget provides orientation without unexpectedly changing my directory or session.
11. As a ly-pi maintainer, I want the widget to be an independent submodule of the unified extension, so that it has clear ownership without coupling to `my-hud`.
12. As a ly-pi maintainer, I want behavior verified at agreed data and widget seams, so that future refactors preserve the user-facing contract.

## Implementation Decisions

### Independent module ownership

`my-worktree` is an independent submodule registered by the existing unified ly-pi entry point. It is not a field, feature, or dependency of `my-hud`.

### Worktree snapshot contract

The data module obtains the Git worktree set for the repository containing the session working directory. It exposes the primary worktree root alongside the visible collection, excludes inaccessible and prunable records, identifies the deepest worktree containing the session directory as Current Worktree, and represents detached HEAD entries with a short commit SHA. The complete visible collection is retained only to calculate the aggregate count and eligibility; it is not a rendering list.

### Visibility contract

The widget is eligible only when at least two visible worktrees exist and a unique Current Worktree can be identified. Non-Git directories, Git command failures, malformed output, missing Current Worktree, and ineligible collections silently produce no widget.

### Rendering contract

The widget is placed above the editor as exactly two Todo-style lines: an accent `● Worktrees (N)` heading and a neutral `└─ •` Current Worktree row. `N` counts every visible worktree, including the current one, but no other worktree is rendered. The row contains the current branch or detached-HEAD identifier and worktree root path. The primary worktree root is `<REPO>` and its descendants begin `<REPO>/`; a worktree outside that path remains absolute. At limited width, rendering truncates the beginning of the path so its ending remains visible; if no path character fits after the label, the widget hides entirely.

### Refresh contract

The worktree snapshot refreshes at session startup and at the beginning and end of each Pi turn. It recomputes Current Worktree from the latest visible set, including after an external worktree removal. The widget itself does not create an idle timer, filesystem watcher, selector, or worktree-switching behavior. The separately documented `/close-worktree` command is the sole approved manager operation and does not alter the widget's read-only behavior.

### Configuration and special state scope

The initial release has no user configuration. Locked but accessible worktrees remain ordinary visible worktrees; no extra Git status, dirty-state, or lock indicator is added.

## Testing Decisions

### What makes a good test

Tests observe the agreed public behavior at the same seams used by callers. They assert known worktree inputs and visible widget output rather than private caches, parsing loops, or internal state.

### Data seam

Tests cover the public worktree snapshot behavior: ordinary branch records, detached-HEAD identifiers, prunable or inaccessible records, deepest-current selection, and the two-visible-worktree threshold.

### Widget seam

Tests cover the extension's public Pi integration: widget registration above the editor, exactly one neutral Current Worktree row with the aggregate count, startup and turn refresh behavior, silent hiding when no current entry resolves or no path width remains, and width-safe path rendering.

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
- Showing the branch or path of a non-current Visible Worktree
- Widget-initiated changes to Git repositories or worktree management commands; the separately documented `/close-worktree` manager operation is the sole approved exception

## Further Notes

- The established domain vocabulary in `CONTEXT.md` defines Multi-worktree Repository, Current Worktree, Visible Worktree, and Worktree Widget for this feature.
- The module and UI policy are local and reversible, so no ADR is needed.
- Completion requires the repository's full `bun run verify` validation and the normal deploy-and-reload flow for the Pi extension.
