# Keep tool-row expansion on Pi's global toggle because mouse input is fullscreen-only

Pi enables mouse reporting only in `--tui-mode fullscreen` (the alt-screen TUI is the only place that writes the mouse tracking sequences; regular mode leaves the terminal's scrollback and mouse untouched), and Pi's per-row expansion has exactly one entry point: a click on a tool row's result region. The tool-run fold therefore treats Pi's global `ctrl+o` toggle as its only expansion affordance — no click handling, no new shortcut, no per-run expanded state. Expansion is always session-wide, and a folded run carries no state of its own, so a half-expanded run cannot exist. The cost is that a user cannot inspect one run in isolation without expanding every run.

## Considered Options

- **Intercept clicks on the Run Summary Row**: rejected. In regular mode clicks never reach the application, so the primary affordance would be unreachable for the default TUI. Fullscreen users who click a folded row still get Pi's native per-row toggle, which reveals that row's own output while the rest of its run stays hidden — a transient state that disappears on the next expand/collapse cycle.
- **Register a keyboard shortcut that toggles the most recent run**: rejected by the user, who preferred reusing the key that already means "show tool output" over learning a second expansion gesture with different scope.
- **Reuse Pi's per-row expanded flag as the per-run fold state**: rejected. A click and the global toggle arrive as the same flag, so a per-run decision could not be distinguished from the global one, and "expand this run" would silently mean different things depending on how it was triggered.

## Consequences

- Fold state stays stateless: a Tool Run is folded whenever the global toggle is off, so there is no per-run bookkeeping, no latch, and nothing to persist or restore.
- A future per-run expansion needs either a keyboard affordance or fullscreen-only clicking, and it would have to introduce per-run state; revisit this decision then.
