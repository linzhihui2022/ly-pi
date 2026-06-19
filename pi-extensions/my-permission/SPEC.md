# my-permission Spec

> Status: implementation baseline
> Confirmed date: 2026-06-19
> Goal: build a local `my-permission` extension that replaces `@gotgenes/pi-permission-system`.

## 1. Design philosophy

- **Deterministic gates**: every permission decision follows a documented matching order and ends with `allow`, `deny`, or `ask`.
- **Session-local control**: `yolo` and `yoloAllSub` exist only in memory for the current session; config is never mutated by commands.
- **No subagent coupling**: Pi spawns subagents as independent OS processes, so policy is injected by the parent and evaluated locally by the child.
- **Zero external dependencies**: only Pi SDK (`@earendil-works/pi-coding-agent`) and Node.js built-ins.
- **TDD**: write tests first; pure functions and stateless modules target 100% coverage.

## 2. Module layout

```
pi-extensions/my-permission/
├── index.ts                 # extension entry point; wires hooks, commands, state
├── config.ts                # load/merge global + project configs; cache
├── matcher.ts               # glob pattern matching
├── checker.ts               # permission evaluation engine
├── dialog.ts                # permission prompt UI
├── session-state.ts         # per-session mutable state
├── project-rules.ts         # read/write projects/<hash>.json
├── subagent-policy.ts       # policy selection + snapshot serialization
├── logger.ts                # audit/debug logging
├── commands.ts              # /yolo and /yolo-all-sub
├── handlers/
│   ├── tool-call.ts         # gate all tool invocations
│   ├── agent-prep.ts        # before_agent_start tool filtering
│   ├── lifecycle.ts         # session_start / session_shutdown
│   └── subagent-spawn.ts    # (deprecated) kept for reference
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── REQUIREMENTS.md          # requirement checklist
├── SPEC.md                  # this document
└── scripts/deploy.ts        # deploy to ~/.pi/agent/extensions/my-permission/
```

Dependency direction:

```
index.ts
  → commands.ts
  → session-state.ts
  → config.ts
  → logger.ts
  → handlers/tool-call.ts
      → checker.ts
          → matcher.ts
          → config.ts
      → dialog.ts
      → session-state.ts
      → logger.ts
      → subagent-policy.ts
          → project-rules.ts
```

## 3. Configuration

### 3.1 File paths

| Scope | Path |
|---|---|
| Global config | `~/.pi/agent/my-permission/config.json` |
| Project overrides | `~/.pi/agent/my-permission/projects/<hash>.json` |
| Logs | `~/.pi/agent/my-permission/logs/` |
| Subagent snapshots | `~/.pi/agent/my-permission/snapshots/` |
| Extension code | `~/.pi/agent/extensions/my-permission/index.js` |

### 3.2 Schema

```jsonc
{
  "log": { "debug": false, "review": true },
  "default": "ask",
  "tools": { "read": "allow", "write": "deny", "ask_user_question": "allow" },
  "bash": { "*": "ask", "git status *": "allow" },
  "paths": { "*": "allow", "*.env": "deny", "**/*.env": "deny" },
  "skills": { "*": "ask" },
  "external": "ask"
}
```

### 3.3 Merge semantics

Per-pattern shallow merge:

```
merged.tools  = { ...global.tools,  ...project.tools  }
merged.bash   = { ...global.bash,   ...project.bash   }
merged.paths  = { ...global.paths,  ...project.paths  }
merged.skills = { ...global.skills, ...project.skills }
merged.default  = project.default  ?? global.default
merged.external = project.external ?? global.external
merged.log      = { ...global.log, ...project.log }
```

## 4. Permission evaluation

### 4.1 Matching order

1. Session rules
2. `config.tools[toolName]`
3. `config.bash[pattern]` (bash only)
4. `config.paths[pattern]` (path-bearing tools only)
5. `config.skills[pattern]` (skill operations only)
6. `config.external` (when `isExternal`)
7. `config.default`

### 4.2 External path detection

A path is external when the resolved, symlink-followed target lies outside the resolved, symlink-followed `ctx.cwd`.

```typescript
function isExternal(cwd: string, target: string): boolean {
  const resolved = path.resolve(cwd, target);
  const realTarget = fs.realpathSync(resolved).catch(() => resolved);
  const realCwd = fs.realpathSync(cwd).catch(() => cwd);
  const rel = path.relative(realCwd, realTarget);
  return rel.startsWith("..") || path.isAbsolute(rel);
}
```

Paths under `~/.pi/agent/extensions/my-permission/` are always treated as internal.

### 4.3 Path pattern matching

`paths` patterns match the full relative path using standard glob semantics:

- `*` matches any sequence except `/`.
- `**` matches any sequence including `/`.

Examples:
- `*.env` matches `.env` but not `src/.env`.
- `**/*.env` matches `.env`, `src/.env`, and `a/b/c.env`.

### 4.4 Bash pattern matching

Bash commands are normalized before matching:

1. Trim whitespace.
2. Collapse consecutive whitespace.
3. Split into tokens on unquoted whitespace, preserving quoted strings.
4. Strip leading environment-variable assignments.

Pattern `git status *` matches `git status`, `git status --short`, and `git  status --short` after normalization.

### 4.5 Yolo shortcut

If the current session has `yolo === true`, any `ask` result is promoted to `allow`. Configured `deny` remains `deny`.

## 5. Session state

```typescript
interface SessionState {
  yolo: boolean;
  yoloAllSub: boolean;
  sessionRules: SessionRule[];
}
```

Session rules are persisted into the session file via `pi.appendEntry("my-permission:session-rule", rule)` so they survive `/reload` and are restored when `session_start` fires with `reason: "reload"`.

## 6. Subagent policy

Pi spawns subagents as separate OS processes (`pi --mode json -p --no-session`). There is no `subagents:child:session-created` event and no shared memory.

### 6.1 Detection

A process is a subagent when started with `--no-session` and either:
- `MY_PERMISSION_SUBAGENT_POLICY` is set, or
- `MY_PERMISSION_SUBAGENT_POLICY_FILE` points to an existing snapshot file, or
- it runs in `json`/`print` mode with one of those flags present.

### 6.2 Policy selection

When a `subagent` tool call is gated in the parent session:

1. Default to `yolo` if `yoloAllSub === true`, otherwise `inherit-parent`.
2. If `ctx.hasUI`, show a select dialog with the three policies.
3. Write a temporary policy snapshot.
4. Inject `MY_PERMISSION_SUBAGENT_POLICY_FILE` into the child environment and allow the call to proceed.

When `ctx.hasUI` is false, the default policy is applied silently and logged to `review.jsonl`.

### 6.3 Snapshot

Path: `~/.pi/agent/extensions/my-permission/snapshots/<parent-session-id>-<timestamp>-<random>.json`

```typescript
interface SubagentPolicySnapshot {
  policy: "yolo" | "read-only" | "inherit-parent";
  inheritedRules?: {
    config: MergedConfig;
    sessionRules: SessionRule[];
    yolo: boolean;
  };
}
```

Snapshots are written atomically and cleaned up by both parent (after tool completion) and child (on `session_shutdown`) for redundancy.

### 6.4 Policy behaviors

| Policy | Behavior |
|---|---|
| `yolo` | Child `yolo = true`; `ask` becomes `allow`; `deny` remains `deny`. |
| `read-only` | Child `yolo = false`; `write`, `edit`, and `bash` are hard-denied; other tools follow config. |
| `inherit-parent` | Child receives parent merged config, session rules, and `yolo` flag; evaluates locally. |

`parent-confirm` is not supported because the child has no TUI and the parent may be blocked waiting for the child result.

## 7. Logging

- `review.jsonl`: synchronous append on every permission decision.
- `debug.jsonl`: buffered, flushed on 100 entries or `session_shutdown`.

## 8. Dialog options

For each normal `ask`:

1. Allow once
2. Allow for this session
3. Allow for this project
4. Deny
5. Deny with reason

## 9. Commands

| Command | Behavior |
|---|---|
| `/yolo` | Toggle session `yolo`; print state. |
| `/yolo-all-sub` | Toggle session `yoloAllSub`; print state. |

Both affect only the current session and do not write config.

## 10. Testing

| Module | Coverage target |
|---|---|
| `matcher.test.ts` | 100% |
| `config.test.ts` | 100% |
| `checker.test.ts` | 100% |
| `dialog.test.ts` | 100% |
| `session-state.test.ts` | 100% |
| `project-rules.test.ts` | 100% |
| `subagent-policy.test.ts` | 100% |
| `logger.test.ts` | 100% |
| `handlers/tool-call.test.ts` | 100% |
| `index.test.ts` | integration, excluded |

Pure-function modules get fully mocked unit tests. Handlers that depend on Pi runtime get integration tests with mocked `ExtensionAPI`.

## 11. Deployment

1. `bunx turbo run build` → `dist/index.js`
2. `bun run deploy` copies artifacts to `~/.pi/agent/extensions/my-permission/`
3. In Pi run `/reload`
4. Manually remove/disable `@gotgenes/pi-permission-system` to avoid collisions

## 12. Excluded features

| Feature | Reason |
|---|---|
| `parent-confirm` subagent policy | Pi subagents are independent processes; forwarding risks deadlock |
| Auto-conversion from old schema | manual migration keeps config explicit |
| Arbitrary `/allow <tool>` commands | session rules cover the same use case |
| Network or IPC forwarding | out of scope |
