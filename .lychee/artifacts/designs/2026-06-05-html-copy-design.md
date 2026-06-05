# Pi Extension: /html + /copy Commands

## Overview

Two slash commands for the pi agent that let the user preview and copy the latest agent reply.

| Command | Behavior |
|---------|----------|
| `/html` | Render the latest assistant reply as HTML, start a local HTTP server, and auto-open the browser |
| `/copy [md] [--thinking]` | Copy the latest assistant reply to the macOS clipboard (plain text by default; `md` for raw Markdown; `--thinking` to include thinking blocks) |

---

## Scope

**In scope:**
- Extract the most recent `assistant` message from `ctx.sessionManager.getEntries()`
- Support `thinking` block extraction (when `--thinking` flag is present)
- Full Markdown-to-HTML rendering with syntax highlighting via `marked` + `highlight.js`
- Self-contained HTML document with inline CSS (GitHub-style markdown styling)
- Local HTTP server with auto port selection
- Auto-open browser via `open` npm package
- Single server instance: new `/html` closes the old one
- Server cleanup on `session_shutdown`
- Clipboard copy via macOS `pbcopy`

**Out of scope:**
- Cross-platform clipboard support (macOS only)
- Persistent HTML file storage
- Multi-message or multi-turn selection
- Non-Markdown content rendering (images, audio, etc.)
- Server-side live reload / WebSocket

---

## Data Flow: /html

```
1. User executes /html
2. Read ctx.sessionManager.getEntries()
3. Find the latest entry with entry.type === "message" && entry.message.role === "assistant"
4. Extract content text and thinking blocks
5. Convert Markdown → HTML via marked (thinking rendered as collapsible block)
6. Inject into HTML template with inline CSS
7. Stop existing server (if any)
8. Start new HTTP server on available port
9. Open browser to server URL
10. Notify user with URL
```

## Data Flow: /copy

```
1. User executes /copy [md] [--thinking]
2. Read ctx.sessionManager.getEntries()
3. Find latest assistant message
4. If --thinking: prepend thinking content
5. If md flag: keep raw Markdown; else strip Markdown syntax to plain text
6. Spawn pbcopy process, pipe content to stdin
7. Notify user of success / failure
```

---

## Architecture

### Directory Structure

```
pi-extensions/my-html/
├── index.ts          # Extension entry point: command registration, lifecycle
├── server.ts         # HTTP server lifecycle (start, stop, port finding)
├── render.ts         # Markdown → HTML conversion, template assembly
├── clipboard.ts      # pbcopy integration
├── types.ts          # TypeScript interfaces
├── my-html.json      # Extension config (enabled flag)
├── index.test.ts     # Integration tests
├── server.test.ts    # Server tests
├── render.test.ts    # Rendering tests
├── clipboard.test.ts # Clipboard tests
└── package.json      # marked, highlight.js, open dependencies
```

### Components

#### `index.ts` — Extension Entry

- Registers `/html` and `/copy` commands via `pi.registerCommand`
- Listens to `session_shutdown` to clean up running server
- Holds a singleton server reference

#### `server.ts` — HTTP Server

- `findAvailablePort(startPort, host)` — scans for an open port
- `createPreviewServer(htmlContent, options)` — starts `node:http` server, serves the HTML on `/`
- `stopPreviewServer()` — closes the server and clears the reference
- Auto-opens browser via `open` package

#### `render.ts` — HTML Rendering

- `renderMarkdownToHtml(markdown: string): string` — uses `marked` with `highlight.js` for code blocks
- `buildHtmlDocument(bodyHtml: string, thinkingHtml?: string): string` — wraps in full HTML template with inline CSS
- `stripMarkdown(markdown: string): string` — removes Markdown syntax for plain-text output

#### `clipboard.ts` — Clipboard

- `copyToClipboard(text: string): void` — spawns `pbcopy`, pipes text to stdin
- Handles errors gracefully (notify user if pbcopy fails)

---

## HTML Template Design

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pi Agent Reply</title>
  <style>
    /* GitHub markdown light theme — inline */
    /* Includes: typography, code blocks with highlight.js, tables, blockquotes, lists */
  </style>
</head>
<body>
  <main class="markdown-body">
    <!-- Optional thinking block -->
    <details class="thinking-block">
      <summary>🧠 Thinking</summary>
      <pre>...</pre>
    </details>
    <!-- Main content -->
    ...
  </main>
</body>
</html>
```

- CSS is **fully inlined** — no external resources required
- `highlight.js` CSS is also inlined for syntax highlighting
- Thinking block is rendered as a collapsible `<details>` element
- Responsive layout with `max-width: 900px` centered

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No assistant message found | Notify: "No agent reply to preview." |
| Markdown parsing error | Fallback to `<pre>` wrapped raw text |
| No available port | Notify error, abort |
| Browser open fails | Notify with URL: "Server running at http://..." |
| `pbcopy` fails | Notify error, offer to show content in terminal |

---

## Server Lifecycle

```
/html invoked
    ↓
stop existing server (if any)
    ↓
start new server → save reference
    ↓
open browser
    ↓
session_shutdown
    ↓
stop server → clear reference
```

- Maximum one server instance at a time
- Re-invoking `/html` gracefully replaces the old preview
- Server is lightweight: serves a single in-memory HTML string

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `marked` | Markdown → HTML |
| `highlight.js` | Syntax highlighting for code blocks |
| `open` | Cross-platform browser auto-open |

---

## Testing Strategy

- **Unit tests** (100% coverage required):
  - `render.ts`: Markdown parsing, HTML template assembly, Markdown stripping
  - `server.ts`: port finding, server start/stop, request handling
  - `clipboard.ts`: pbcopy spawning, error handling
- **Integration tests**:
  - Command registration, lifecycle events, end-to-end flow
- Excluded from coverage: `types.ts`, `index.ts` (integration entry point)

---

## Notes

- Only supports macOS (`pbcopy`). Cross-platform clipboard is out of scope.
- Thinking blocks are only shown in `/html` and `/copy --thinking`.
- The `/copy md` flag preserves raw Markdown; without it, Markdown syntax is stripped to plain text.
