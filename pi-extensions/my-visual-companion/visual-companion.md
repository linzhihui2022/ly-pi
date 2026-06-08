# Visual Companion Skill Guide

## When to Use Visual Companion

Use the browser-based Visual Companion when:
- Comparing multiple design options side-by-side
- Showing mockups or wireframes
- Presenting structured choices (A/B/C) with rich formatting
- Visual layout significantly aids comprehension

Use the terminal when:
- Simple text Q&A
- Code review without visual layout needs
- Quick confirmations

## Tool Reference

### visual_companion_start
Starts a browser session. Returns `{sessionId, port, URL}`.

### visual_companion_show
Pushes HTML to the browser. Parameters:
- `session_id`: from `visual_companion_start`
- `name`: semantic screen name (e.g., `layout-options`, never reuse names)
- `html`: HTML fragment or full document

### visual_companion_read_events
Returns user events (clicks, confirms) as an array. Call after showing a screen and waiting for user interaction.

### visual_companion_stop
Closes the session and frees resources.

## Configuration

`my-visual-companion.json`:

| Field | Required | Description |
|-------|----------|-------------|
| `focusApp` | No | macOS application name to bring to front after user confirms (e.g. `"WezTerm"`). If omitted, no focus action occurs. |
| `defaultHost` | No | HTTP bind address (default `127.0.0.1`) |
| `defaultUrlHost` | No | Hostname shown in URLs (default `localhost`) |
| `idleTimeoutMinutes` | No | Session idle timeout (default `30`) |

On confirm, when `focusApp` is set, macOS runs `osascript -e 'tell application "<focusApp>" to activate'`. Focus failures are silently ignored. There is no default fallback — unset means no focus behavior.

## HTML Fragment Guidelines

1. Use semantic filenames — never reuse a screen name within a session
2. For fragments (no `<!DOCTYPE` or `<html>`), the server auto-wraps in the Brainstorm Companion frame
3. For full documents, they are served as-is
4. Interactive elements:
   - `[data-choice]` — clickable option (single or multi-select)
   - `[data-multiselect]` — allows multiple selections
   - `#confirm-btn` — user confirms selection (auto-handled by frame)

## Event Flow

1. Call `visual_companion_start`
2. Call `visual_companion_show` with your HTML
3. Wait for user to interact (the LLM pauses, user clicks/confirm)
4. Call `visual_companion_read_events` to get choices
5. Parse confirm/click events and continue
6. Call `visual_companion_stop` when done

## Best Practices

- One question per screen — clear and focused
- Use `confirm` events (user clicks confirm button) rather than raw clicks when possible
- Screens auto-clear events on each new `show` call
- Sessions auto-expire after 30 minutes of inactivity
- Always call `stop` when done to free the port

## Limitations

- localhost only (no remote access)
- Single browser window per session
- One user interacting at a time
- Requires a modern browser with WebSocket support
