# Visual Companion Requirements

## What this extension does

Provide a browser-based visual companion for Pi so the assistant can show
mockups, diagrams, and structured choices during a conversation. The user
interacts with the browser and the assistant receives the result through
Pi tools without switching back to the terminal.

## Functional requirements

1. `visual_companion_start` opens a local HTTP/WebSocket server and returns a
   session URL.
2. `visual_companion_show` pushes an HTML fragment or full document to the
   browser and refreshes the page.
3. `visual_companion_wait` blocks until the user clicks the confirmation button
   in the browser, then returns the confirm event.
4. `visual_companion_read_events` returns all recorded click/confirm events for
   the session.
5. `visual_companion_stop` shuts down the server and frees resources.

## Security requirements

- VC-SEC-1: Every session must have a cryptographically random session key.
- VC-SEC-2: The session key must be part of the URL returned to the assistant
  (`?key=...`).
- VC-SEC-3: HTTP requests to `/` and `/files/*` must reject requests without a
  valid session key.
- VC-SEC-4: WebSocket upgrade requests must reject connections without a valid
  session key.
- VC-SEC-5: The browser must remember the key (cookie or query param) so
  reloads and `/helper.js` continue to work after the first validated load.
- VC-SEC-6: A key must not be guessable from the port or session id alone.

## Persistence requirements

- VC-PER-1: Each session must persist its event stream to the working tree at
  `.lychee/visual-companion/<session-id>/events.jsonl`.
- VC-PER-2: Events must be appended as one JSON object per line, in order.
- VC-PER-3: A new screen must clear the in-memory event buffer (existing
  behavior), but the persisted file may keep the full history or rotate per
  screen — the design decision belongs in SPEC.md.
- VC-PER-4: The companion must still work when the project root cannot be
  determined; in that case it falls back to a temp directory or keeps events
  in memory only.
- VC-PER-5: Session workspace directories must be ignored by git automatically.

## Non-requirements / out of scope

- Screen HTML persistence (saving `*.html` files to disk) is out of scope.
- Cross-machine access beyond `localhost`/`127.0.0.1` is out of scope.
- Auto-opening the user's browser is out of scope.
- Authentication tied to Pi user identity is out of scope.
