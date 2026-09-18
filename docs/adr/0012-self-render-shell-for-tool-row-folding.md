# Use a self-rendered shell for tool rows so folded rows can occupy zero lines

`my-tool-display` renders its seven covered native tools through Pi's default tool-row shell, which always reserves a separator line for every row. Folding a Tool Run into a single Run Summary Row therefore cannot hide a row: each "hidden" row would still eat one blank line, so a twenty-call run would leave twenty blank lines behind. We now register those tools with the self-rendered shell instead and draw the frame — separator, vertical padding, horizontal inset, and the three state backgrounds — inside the module, rendering a folded row as an empty component so it occupies nothing. The trade is that the module now owns framing, width safety, and visual parity for every visible row; the gain is that folding is possible at all and later row-density changes stop being constrained by Pi's fixed shell.

## Considered Options

- **Keep the default shell and only shrink row content**: rejected. The reserved separator line is created by Pi's row component before any renderer runs, so hidden rows can never reach zero height; a run of twenty calls would still consume twenty lines of blank space, which does not solve the user-visible problem.
- **Carry the summary in a custom entry and remove tool rows**: rejected. Custom entries have no update or re-render path, so a live call count and running duration could not be shown, and the summary would have to be appended only after the run ended — below every tool row it is supposed to replace.
- **Let a separate extension own the renderers and fold from there**: rejected. Two extensions registering the same native tools violates the module's existing "do not take a tool away from another owner" contract and would leave presentation rules split across owners.

## Consequences

- Visible rows must stay visually identical to the previous default-shell output; any difference is a defect rather than an incidental improvement, and the module now carries that parity requirement in its tests.
- Framing, width safety, and state background selection become module responsibilities, owned alongside the existing compact-output rules.
- The decision depends on Pi's row component contract: if Pi changes how a self-rendered row is composed, or adds a first-class row visibility API, this choice should be revisited.
