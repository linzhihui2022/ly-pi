# Visual Companion Guide

Browser-based visual brainstorming companion for showing mockups, diagrams, and options.

## When to Use

Decide per-question, not per-session. The test: **would the user understand this better by seeing it than reading it?**

**Use the browser** when the content itself is visual:

- **UI mockups** — wireframes, layouts, navigation structures, component designs
- **Architecture diagrams** — system components, data flow, relationship maps
- **Side-by-side visual comparisons** — comparing two layouts, two color schemes, two design directions
- **Design polish** — when the question is about look and feel, spacing, visual hierarchy
- **Spatial relationships** — state machines, flowcharts, entity relationships rendered as diagrams

**Use the terminal** when the content is text or tabular:

- **Requirements and scope questions** — "what does X mean?", "which features are in scope?"
- **Conceptual A/B/C choices** — picking between approaches described in words
- **Tradeoff lists** — pros/cons, comparison tables
- **Technical decisions** — API design, data modeling, architectural approach selection
- **Clarifying questions** — anything where the answer is words, not a visual preference

A question *about* a UI topic is not automatically a visual question. "What kind of wizard do you want?" is conceptual — use the terminal. "Which of these wizard layouts feels right?" is visual — use the browser.

## How It Works

The Visual Companion is a Pi extension that provides four tools. You call `visual_companion_start` to open a browser session, then push HTML screens with `visual_companion_show`. The user sees the content in their browser and can click to select options. You read their interactions with `visual_companion_read_events`.

**Content fragments vs full documents:** If your HTML starts with `<!DOCTYPE` or `<html`, it is served as-is. Otherwise, the server automatically wraps your content in the frame template — adding the header, CSS theme, selection indicator, and all interactive infrastructure. **Write content fragments by default.** Only write full documents when you need complete control over the page.

## Starting a Session

Call `visual_companion_start` to start a browser session.

Returns: `{sessionId, port, url}` — save the `sessionId` for subsequent calls.

Tell the user to open the URL.

## The Loop

1. **Check the session is active**, then **push HTML** with `visual_companion_show`:
   - Parameters: `session_id` (from start), `name` (semantic screen name), `html` (content)
   - Use semantic names: `platform`, `visual-style`, `layout`
   - **Never reuse screen names** within a session — each screen gets a fresh name
   - The server automatically serves the newest screen

2. **Tell user what to expect and end your turn:**
   - Remind them of the URL (every step, not just first)
   - Give a brief text summary of what's on screen (e.g., "Showing 3 layout options for the homepage")
   - Ask them to respond in the terminal: "Take a look and let me know what you think. Click to select an option if you'd like."

3. **On your next turn** — after the user responds in the terminal:
   - Call `visual_companion_read_events` with the `session_id`
   - **Look for `type: "confirm"` events first** — these represent the user's final decision after clicking the confirm button
   - If no `confirm` event exists, fall back to the last `click` event as the tentative selection
   - Merge with the user's terminal text to get the full picture
   - The terminal message is the primary feedback; events provide structured interaction data

4. **Iterate or advance** — if feedback changes current screen, push a new screen with a new name (e.g., `layout-v2`). Only move to the next question when the current step is validated.

5. **Unload when returning to terminal** — when the next step doesn't need the browser (e.g., a clarifying question, a tradeoff discussion), push a waiting screen to clear the stale content:

   ```html
   <!-- name: waiting (or waiting-2, etc.) -->
   <div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
     <p class="subtitle">Continuing in terminal...</p>
   </div>
   ```

   This prevents the user from staring at a resolved choice while the conversation has moved on. When the next visual question comes up, push a new content screen as usual.

6. Repeat until done.

## Writing Content Fragments

Write just the content that goes inside the page. The server wraps it in the frame template automatically (header, theme CSS, selection indicator, and all interactive infrastructure).

**Minimal example:**

```html
<h2>Which layout works better?</h2>
<p class="subtitle">Consider readability and visual hierarchy</p>

<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>Single Column</h3>
      <p>Clean, focused reading experience</p>
    </div>
  </div>
  <div class="option" data-choice="b" onclick="toggleSelect(this)">
    <div class="letter">B</div>
    <div class="content">
      <h3>Two Column</h3>
      <p>Sidebar navigation with main content</p>
    </div>
  </div>
</div>
```

That's it. No `<html>`, no CSS, no `<script>` tags needed. The server provides all of that.

## CSS Classes Available

The frame template provides these CSS classes for your content:

### Options (A/B/C choices)

```html
<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>Title</h3>
      <p>Description</p>
    </div>
  </div>
</div>
```

**Multi-select:** Add `data-multiselect` to the container to let users select multiple options. Each click toggles the item. The indicator bar shows the count.

```html
<div class="options" data-multiselect>
  <!-- same option markup — users can select/deselect multiple -->
</div>
```

### Cards (visual designs)

```html
<div class="cards">
  <div class="card" data-choice="design1" onclick="toggleSelect(this)">
    <div class="card-image"><!-- mockup content --></div>
    <div class="card-body">
      <h3>Name</h3>
      <p>Description</p>
    </div>
  </div>
</div>
```

### Mockup container

```html
<div class="mockup">
  <div class="mockup-header">Preview: Dashboard Layout</div>
  <div class="mockup-body"><!-- your mockup HTML --></div>
</div>
```

### Split view (side-by-side)

```html
<div class="split">
  <div class="mockup"><!-- left --></div>
  <div class="mockup"><!-- right --></div>
</div>
```

### Pros/Cons

```html
<div class="pros-cons">
  <div class="pros"><h4>Pros</h4><ul><li>Benefit</li></ul></div>
  <div class="cons"><h4>Cons</h4><ul><li>Drawback</li></ul></div>
</div>
```

### Mock elements (wireframe building blocks)

```html
<div class="mock-nav">Logo | Home | About | Contact</div>
<div style="display: flex;">
  <div class="mock-sidebar">Navigation</div>
  <div class="mock-content">Main content area</div>
</div>
<button class="mock-button">Action Button</button>
<input class="mock-input" placeholder="Input field">
<div class="placeholder">Placeholder area</div>
```

### Typography and sections

- `h2` — page title
- `h3` — section heading
- `.subtitle` — secondary text below title
- `.section` — content block with bottom margin
- `.label` — small uppercase label text

## Browser Events Format

When the user interacts with the browser, events are returned by `visual_companion_read_events` as an array of objects.

**Click events** — recorded when the user clicks an option:
```json
{"type":"click","choice":"a","text":"Option A - Simple Layout","timestamp":1706000101}
{"type":"click","choice":"c","text":"Option C - Complex Grid","timestamp":1706000108}
```

**Confirm events** — recorded when the user clicks the **确认** button to finalize their selection:
```json
{"type":"confirm","choice":"b","text":"Option B - Hybrid","count":1,"timestamp":1706000120}
```

For multi-select mode, `choice` is an array and `count` reflects the number of selections:
```json
{"type":"confirm","choice":["a","c"],"text":"Option A, Option C","count":2,"timestamp":1706000125}
```

**Reading events in Pi:**
- **Prefer `confirm` events** — they represent the user's explicit final decision. The confirm button disables further interaction, so you can trust this as the definitive answer.
- **Fall back to `click` events** — if no confirm exists, the last `click` event is typically the tentative selection.
- The full `click` stream can reveal hesitation or exploration patterns worth asking about.

If no events are returned, the user didn't interact with the browser — use only their terminal text.

## Design Tips

- **Scale fidelity to the question** — wireframes for layout, polish for polish questions
- **Explain the question on each page** — "Which layout feels more professional?" not just "Pick one"
- **Iterate before advancing** — if feedback changes current screen, push a new version
- **2-4 options max** per screen
- **Use real content when it matters** — for a photography portfolio, use actual images (Unsplash). Placeholder content obscures design issues.
- **Keep mockups simple** — focus on layout and structure, not pixel-perfect design

## Screen Naming

- Use semantic names: `platform`, `visual-style`, `layout`
- Never reuse names within a session — each screen must have a unique name
- For iterations: append version suffix like `layout-v2`, `layout-v3`

## Cleaning Up

Call `visual_companion_stop` with the `session_id` when the session is complete.

Sessions auto-expire after 30 minutes of inactivity, but explicit cleanup is recommended.
