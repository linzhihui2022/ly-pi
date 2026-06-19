# my-permission Requirements

## Goal

Build a local Pi extension (`pi-extensions/my-permission`) that replaces `@gotgenes/pi-permission-system` with a deterministic, session-aware permission gate.

## Must have

- Permission surfaces:
  - Tools (exact tool name)
  - Bash commands (glob patterns over normalized token sequence)
  - Paths (standard glob patterns over relative paths)
  - Skills (glob patterns over skill names)
  - External directory access (outside `ctx.cwd`)
- Global config at `~/.pi/agent/extensions/my-permission/config.json`
- Per-project overrides at `~/.pi/agent/extensions/my-permission/projects/<hash>.json` where `<hash> = sha256(cwd).slice(0, 12)`
- Per-pattern shallow merge between global and project config
- Session-local `yolo` mode toggled by `/yolo`
- Session-local `yoloAllSub` mode toggled by `/yolo-all-sub`
- Permission prompt with five options for each `ask` decision:
  - Allow once
  - Allow for this session
  - Allow for this project
  - Deny
  - Deny with reason
- Subagent policy injection for the `subagent` tool call:
  - `yolo`
  - `read-only`
  - `inherit-parent`
- Synchronous JSONL audit log at `~/.pi/agent/extensions/my-permission/logs/review.jsonl`
- Buffered JSONL debug log at `~/.pi/agent/extensions/my-permission/logs/debug.jsonl`
- TDD: tests before implementation; pure-function modules target 100% coverage
- Build via `bunx turbo run build`, deploy via `bun run deploy` to `~/.pi/agent/extensions/my-permission/`

## Must not

- Persist yolo state across sessions
- Write project rules inside the project directory
- Implement subagent forwarding over network or out-of-process IPC
- Support arbitrary temporary `/allow <tool>` commands
- Auto-convert configuration from `@gotgenes/pi-permission-system`
- Depend on any subagent package

## Out of scope

- Replacing or uninstalling the original extension automatically
- Built-in migration tooling from the old schema
- Parent-confirmation subagent policy (removed due to independent-process model)
