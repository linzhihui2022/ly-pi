# my-permission Design Spec

> Date: 2026-06-19 | Status: Draft — pending review

## 1. Overview

`my-permission` is a from-scratch Pi extension that replaces `@gotgenes/pi-permission-system`. It provides centralized, deterministic permission gates over Pi tools, bash commands, paths, skills, and external-directory access. The design prioritizes **session-local control**, **simple configuration**, and **clean subagent integration** without coupling to any specific subagent package.

## 2. Goals

1. Replace `@gotgenes/pi-permission-system` entirely.
2. Provide global + per-project permission rules stored under `~/.pi/agent/my-permission/`.
3. Support a **session-only yolo mode** (`/yolo`) that auto-approves `ask` permissions for the current session only.
4. Support a **session-only yolo-all-sub mode** (`/yolo-all-sub`) that defaults new subagents to the `yolo` policy for the current session.
5. Before a `subagent` tool call runs, prompt for one of three policies to inject into the child process:
   - **yolo**: child auto-approves `ask` permissions within its own session.
   - **read-only**: child may only use read-only tools.
   - **inherit-parent**: child receives a snapshot of the parent's effective rules and yolo state, then evaluates locally.
6. Persist project-level rule overrides in a global projects directory, not inside the repository.
7. Emit audit logs for every permission decision.

## 3. Non-Goals

- Do NOT persist yolo state across sessions.
- Do NOT write project rules inside the project directory.
- Do NOT implement subagent forwarding over the network or out-of-process IPC.
- Do NOT support arbitrary temporary `/allow <tool>` commands.
- Do NOT auto-convert configuration from `@gotgenes/pi-permission-system`.

## 4. File Structure

```
pi-extensions/my-permission/
├── index.ts                 # Extension entry point; wires hooks, commands, state
├── config.ts                # Load/merge global + project configs; cache
├── matcher.ts               # Glob pattern matching (exact, prefix *, suffix *, full *)
├── checker.ts               # Permission evaluation engine
├── dialog.ts                # Permission prompt UI
├── session-state.ts         # Per-session mutable state (yolo, session rules, subagent policy)
├── project-rules.ts         # Read/write projects/<hash>.json
├── subagent-policy.ts       # Subagent spawn policy selection + storage
├── logger.ts                # Buffered JSONL audit logging
├── commands.ts              # /yolo and /yolo-all-sub command registration
├── handlers/
│   ├── tool-call.ts         # Gate all tool invocations
│   ├── agent-prep.ts        # before_agent_start: filter active tools/skills
│   ├── lifecycle.ts         # session_start / session_shutdown
│   └── subagent-spawn.ts    # Intercept subagent spawn for policy selection
├── index.test.ts            # Integration tests
├── config.test.ts
├── matcher.test.ts
├── checker.test.ts
├── dialog.test.ts
├── session-state.test.ts
├── project-rules.test.ts
├── subagent-policy.test.ts
├── logger.test.ts
└── handlers/
    ├── tool-call.test.ts
    └── subagent-spawn.test.ts
```

## 5. Configuration

### 5.1 File Paths

| Scope | Path |
|---|---|
| Global config | `~/.pi/agent/my-permission/config.json` |
| Project overrides | `~/.pi/agent/my-permission/projects/<hash>.json` where `<hash>` = `sha256(cwd).slice(0, 12)` |
| Logs | `~/.pi/agent/my-permission/logs/` |
| Subagent snapshots | `~/.pi/agent/my-permission/snapshots/` |
| Extension code | `~/.pi/agent/extensions/my-permission/index.js` |

### 5.2 Config Schema

```jsonc
{
  // Extension behavior
  "log": {
    "debug": false,      // verbose diagnostics
    "review": true       // audit log of every decision
  },

  // Default for any unmatched action
  "default": "ask",      // "allow" | "deny" | "ask"

  // Tool-specific permissions (registered tool names)
  "tools": {
    "read": "allow",
    "write": "deny",
    "edit": "deny",
    "ask_user_question": "allow",
    "web_search": "allow",
    "fetch_content": "allow"
  },

  // Bash command patterns
  "bash": {
    "*": "ask",
    "date": "allow",
    "git status": "allow",
    "git diff": "allow",
    "git *": "ask"
  },

  // Path patterns for read/write/edit/find/grep/ls
  "paths": {
    "*": "allow",
    "*.env": "deny",
    "*.env.*": "deny",
    "*.env.example": "allow"
  },

  // Skill name patterns
  "skills": {
    "*": "ask"
  },

  // External directory access (outside ctx.cwd)
  "external": "ask"
}
```

### 5.3 Merge Semantics

Configs merge by **per-pattern shallow merge**:

- Each concrete pattern in a project category replaces the same pattern in the global config.
- Patterns present only in the global config remain active.
- Top-level scalar fields (`default`, `external`) use `project ?? global`.
- The `log` object is also merged per-field: `{ ...global.log, ...project.log }`.

```
merged.tools  = { ...global.tools,  ...project.tools  }
merged.bash   = { ...global.bash,   ...project.bash   }
merged.paths  = { ...global.paths,  ...project.paths  }
merged.skills = { ...global.skills, ...project.skills }
merged.default  = project.default  ?? global.default
merged.external = project.external ?? global.external
merged.log      = { ...global.log, ...project.log }
```

`yolo` is intentionally **not** in config because it is session-only.

## 6. Session State

```typescript
interface SessionState {
  /** Global yolo for this session. */
  yolo: boolean;

  /** If true, subagents spawned in this session default to yolo policy. */
  yoloAllSub: boolean;

  /** In-memory allow rules added via "Allow for this session". */
  sessionRules: SessionRule[];
}

interface SessionRule {
  surface: string;        // "tools", "bash", "paths", "skills", "external"
  pattern: string;        // matched glob or "*" or tool name
  action: "allow" | "deny";
}
```

Session state is created on `session_start` and destroyed on `session_shutdown`. It normally never touches disk, but session rules are persisted into the session file via `pi.appendEntry()` so they survive `/reload` and are restored when `session_start` fires with `reason: "reload"`.

## 7. Permission Evaluation (checker.ts)

```typescript
interface CheckInput {
  toolName: string;              // e.g. "bash", "read", "web_search"
  command?: string;              // for bash
  path?: string;                 // for path-bearing tools
  skillName?: string;            // for skill loads
  isExternal?: boolean;          // for outside-worktree paths
}

interface CheckResult {
  state: "allow" | "deny" | "ask";
  origin: "session" | "project" | "global" | "default";
  matchedPattern?: string;
  surface: string;
  value: string;
}
```

### 7.1 Matching Order

1. **Session rules** — highest priority
2. **Config.tools[toolName]** — exact tool match
3. **Config.bash[pattern]** — for bash only
4. **Config.paths[pattern]** — for path tools only
5. **Config.skills[pattern]** — for skill operations only
6. **Config.external** — when `isExternal`
7. **Config.default** — fallback

### 7.3 External Path Detection

A path is considered external when the resolved, symlink-followed target lies outside the resolved, symlink-followed `ctx.cwd`.

```typescript
function isExternal(cwd: string, target: string): boolean {
  const resolved = path.resolve(cwd, target);
  const realTarget = fs.realpathSync(resolved).catch(() => resolved);
  const realCwd = fs.realpathSync(cwd).catch(() => cwd);
  const rel = path.relative(realCwd, realTarget);
  return rel.startsWith("..") || path.isAbsolute(rel);
}
```

Paths under `~/.pi/agent/my-permission/` and `~/.pi/agent/extensions/my-permission/` are always treated as internal so the extension can read and write its own config, project rules, snapshots, and logs without being blocked by `external: "ask"` or `external: "deny"`.

### 7.4 Path Pattern Matching

`paths` patterns are matched against the **full relative path** from `ctx.cwd` using standard glob semantics:

- `*` matches any sequence of characters **except** `/`.
- `**` matches any sequence of characters **including** `/`.
- Examples:
  - `*.env` matches `.env` but not `src/.env`.
  - `**/*.env` matches `.env`, `src/.env`, and `a/b/c.env`.
  - `src/**/*.ts` matches `src/a.ts` and `src/a/b.ts`.

### 7.5 Bash Pattern Matching

Before matching, bash commands are normalized with minimal tokenization:

1. Trim leading and trailing whitespace.
2. Collapse consecutive whitespace to a single space.
3. Split into tokens on unquoted whitespace, preserving quoted strings.
4. Strip leading environment-variable assignments (e.g. `FOO=bar git status` becomes `git status`).

Patterns are then matched against the normalized token sequence. For example, the pattern `git status *` matches both `git status` and `git status --short`, and also matches `git  status --short` after normalization.

### 7.6 Yolo Shortcut

If the current session's `yolo` flag is true, any `ask` result from step 1–7 is promoted to `allow` with origin `"yolo"`. A configured `deny` remains `deny`.

## 8. Subagent Policy

Pi's built-in subagent support spawns child work in **separate OS processes** (`pi --mode json -p --no-session`). There is no in-process child session, no shared memory, and Pi does not emit a `subagents:child:session-created` event. Therefore `my-permission` treats subagent control as **policy injection at the parent side**, not session management inside the child.

### 8.1 Detection

A process is considered a subagent when any of the following is true:

- It was started with `--no-session` and the environment variable `MY_PERMISSION_SUBAGENT_POLICY` is set, **or**
- A policy snapshot file exists at the path referenced by `MY_PERMISSION_SUBAGENT_POLICY_FILE`, **or**
- It is running in `json`/`print` mode with one of the above flags present.

`my-permission` does **not** import any subagent package. It only inspects process environment variables supplied by the spawning parent process.

### 8.2 Policy Selection Flow

When a `subagent` tool call is about to run in the parent session, `handlers/tool-call.ts` intercepts it **before** execution (the standard `tool_call` gate):

1. If the parent session has `yoloAllSub === true`, default the selection to `yolo`; otherwise default to `inherit-parent`.
2. If `ctx.hasUI` is true, show a select dialog with three options:
   - `yolo` (pre-selected when `yoloAllSub`)
   - `read-only`
   - `inherit-parent` (pre-selected otherwise)
3. Persist the chosen policy in a **temporary policy snapshot** and pass its path to the child process via `MY_PERMISSION_SUBAGENT_POLICY_FILE`.
4. Allow the `subagent` tool call to execute normally. The child `pi` process loads `my-permission`, reads the snapshot, and initializes its own session state accordingly.

When `ctx.hasUI` is false (e.g. JSON mode), the default policy is applied silently and logged to `review.jsonl` as a `subagent-policy` decision.

### 8.3 Policy Snapshot

The snapshot is a JSON file written to:

```
~/.pi/agent/my-permission/snapshots/<parent-session-id>-<timestamp>-<random>.json
```

It contains only the data the child needs to evaluate permissions locally:

```typescript
interface SubagentPolicySnapshot {
  policy: "yolo" | "read-only" | "inherit-parent";
  /** Present and populated when policy is "inherit-parent". */
  inheritedRules?: {
    config: MergedConfig;
    sessionRules: SessionRule[];
    yolo: boolean;
  };
}
```

Snapshots are written with atomic temp-file + rename and are read-only for the child. Cleanup uses a double-lock strategy:

1. The **parent** attempts to delete the snapshot after the `subagent` tool call completes (in `tool_result`/`tool_execution_end`).
2. The **child** also attempts to delete the snapshot on its `session_shutdown`.

Both deletions are idempotent and ignore "file not found" errors. This handles normal completion, parent crashes, and child crashes.

### 8.4 Policy Behaviors

| Policy | Behavior |
|---|---|
| `yolo` | Child session `yolo = true`; any `ask` result is promoted to `allow`. Configured `deny` remains `deny`. |
| `read-only` | Child session `yolo = false`. The tools `write`, `edit`, and `bash` are hard-denied regardless of config. All other tools follow the inherited config. Note: a custom write-capable tool configured as `allow` could still be used; set `default: "ask"` or `default: "deny"` for stricter read-only subagents. The read-only policy intentionally does not block arbitrary custom tools, preserving the user's explicit config choices. |
| `inherit-parent` | Child receives the parent's merged config, current session rules, and current `yolo` flag. The child then evaluates permissions locally using its own `checker.ts`. |

### 8.5 No Parent Confirmation

Because the child is an independent process with no TUI and the parent may be blocked waiting for the child's result, forwarding child `ask` decisions to the parent UI risks deadlock. `parent-confirm` is therefore **not supported**.

## 9. Dialog Options

For a normal (non-yolo, non-read-only) ask:

1. **Allow once**
2. **Allow for this session** — adds a session rule
3. **Allow for this project** — writes to `projects/<hash>.json`
4. **Deny**
5. **Deny with reason** — prompts for a reason string

For subagents running under the `inherit-parent` or `yolo` policy, session rules added via "Allow for this session" apply only within the child process and are discarded when that child exits. Project rules are written relative to the child's `cwd`, which is normally the same as the parent's.

## 10. Commands

| Command | Behavior |
|---|---|
| `/yolo` | Toggle the current session's yolo mode. Prints current state. |
| `/yolo-all-sub` | Toggle `yoloAllSub` for the current session. New subagents spawned in this session will default to `yolo` policy. |

Both commands affect **only the current session**. They do not write to `config.json`.

## 11. Event Handlers

| Event | Handler | Behavior |
|---|---|---|
| `session_start` | `lifecycle.ts` | Load config, create session state, initialize logger. If a subagent policy snapshot is referenced by environment variables, initialize state from the snapshot instead of disk. |
| `session_shutdown` | `lifecycle.ts` | Flush logs, clear session state, clean up any subagent policy snapshot owned by this process. |
| `before_agent_start` | `agent-prep.ts` | Compute allowed tools, filter denied tools/skills from system prompt. |
| `tool_call` | `tool-call.ts` | Evaluate permission; prompt or block as needed. For `subagent` tool calls, additionally show policy selection and inject `MY_PERMISSION_SUBAGENT_POLICY_FILE` into the child's environment. |

## 12. Logging

Every permission decision is appended synchronously as JSONL to:

```
~/.pi/agent/my-permission/logs/review.jsonl
```

`review.jsonl` is flushed immediately on every decision so audit records are not lost if Pi crashes or is killed.

When `log.debug` is true, additional diagnostics go to:

```
~/.pi/agent/my-permission/logs/debug.jsonl
```

`debug.jsonl` is buffered in memory and flushed on threshold (100 entries) or `session_shutdown`.

## 13. Testing Strategy (TDD)

| Module | Test Focus |
|---|---|
| `matcher.test.ts` | Exact, prefix, suffix, and full wildcards; edge cases. |
| `config.test.ts` | Load, merge, cache invalidation, missing files. |
| `checker.test.ts` | Matching order, session-rule priority, yolo promotion, deny floor. |
| `dialog.test.ts` | Mock UI; each of the five options returns correct decision. |
| `session-state.test.ts` | Yolo toggle, session rule add/match/clear. |
| `project-rules.test.ts` | Round-trip write/read, atomic writes, hash naming. |
| `subagent-policy.test.ts` | Three policies, snapshot serialization, yoloAllSub default, read-only hard denials. |
| `logger.test.ts` | Buffer flush threshold, JSONL format, session shutdown flush. |
| `handlers/tool-call.test.ts` | Full allow/deny/ask flow with mocked dialog. |
| `handlers/subagent-spawn.test.ts` | Policy selection and session state setup. |
| `index.test.ts` | Hook registration, command registration, lifecycle integration. |

## 14. Dependencies

Zero external npm dependencies. Uses only the Pi SDK available at runtime (`@earendil-works/pi-coding-agent`).

## 15. Migration from @gotgenes/pi-permission-system

1. Uninstall `@gotgenes/pi-permission-system`.
2. Install `my-permission` into `~/.pi/agent/extensions/my-permission/`.
3. Manually port rules from the old `config.json` to the new schema.
4. Deploy via the workspace `bun run deploy`.
5. `/reload` in Pi.

## 16. Open Decisions

| # | Decision | Proposed |
|---|---|---|
| 1 | Read-only tool list | `write`, `edit`, and `bash` are hard-denied; all other tools follow config. |
| 2 | Default subagent policy when `yoloAllSub` is off | `inherit-parent`. |
