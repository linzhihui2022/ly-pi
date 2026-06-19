# Visual Companion Specification

## Session key design

- A 32-byte URL-safe base64 key is generated when `visual_companion_start`
  creates the session.
- The public URL returned by `visual_companion_start` is
  `http://<host>:<port>/?key=<key>`.
- The HTTP handler validates the key on every request:
  - `/` and `/files/*` require `key` query param matching the session key.
  - Missing or mismatched keys return `403 Forbidden`.
- The WebSocket upgrade is also gated by the key:
  - `ws://host:port/?key=<key>` is accepted.
  - Connections without a valid key are terminated immediately.
- The browser persists the key via a cookie named `vc_key` scoped to the
  origin. After the first validated load, subsequent requests and the WebSocket
  connection can use the cookie automatically.
- `/helper.js` is also protected: the script request must include the key.
  Because the script tag cannot send a query param dynamically, the helper
  script reads the cookie and includes the key in WebSocket connection URL.
  The server sends `403` for `/helper.js` without a key; the browser falls back
  to loading it with the key in the query string when the page itself was
  loaded with `?key=...`.

## Event persistence design

- The working-tree workspace directory is
  `<repo-root>/.lychee/visual-companion/<session-id>/`.
- Inside that directory:
  - `events.jsonl` — append-only event stream for the current/last screen.
  - `.gitignore` containing `*` so the whole directory is ignored by git.
- `SessionManager.appendEvent` writes to both the in-memory array and the file.
- On a new screen (`updateScreen`), the in-memory event buffer is cleared
  (existing behavior). The file is also truncated so the persisted stream
  reflects the current screen only.
- If `git rev-parse --show-toplevel` fails, the workspace falls back to
  `os.tmpdir()/.lychee/visual-companion/<session-id>/`.
- Session stop deletes the in-memory events and optionally removes the
  workspace directory to free space. (Decision: keep files by default so a
  crash leaves audit data; `visual_companion_stop` does not delete.)

## Sequence diagram

```
LLM -> visual_companion_start
  <- { sessionId, port, url }

LLM -> visual_companion_show(name, html)
  -> clear in-memory events, truncate events.jsonl
  -> broadcast reload via WebSocket

Browser loads /?key=...
  -> server validates key, returns frame-wrapped HTML
  -> helper.js reads cookie, connects ws://host/?key=...

User clicks option
  -> helper sends click event with key over WS
  -> server validates key, appends to events.jsonl

User clicks confirm
  -> helper sends confirm event
  -> server resolves visual_companion_wait

LLM -> visual_companion_read_events
  <- events from events.jsonl
```

## Backwards compatibility

- This is an internal extension; there is no public API stability guarantee
  across Pi versions.
- Existing slash commands and tool names remain unchanged.
