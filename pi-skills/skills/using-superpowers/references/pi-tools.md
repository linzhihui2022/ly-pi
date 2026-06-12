# Pi Tool Quick Reference

A concise reference for tools available when executing Pi skills.

## Skill Invocation

Pi loads skills via XML block, not a tool call:

```xml
<skill name="brainstorming" location="/Users/lychee/.pi/agent/skills/brainstorming/SKILL.md">
  <!-- skill body -->
</skill>
```

## Core File Tools

| Tool | Purpose |
|---|---|
| `read` | Read text files and images |
| `write` | Create or overwrite files |
| `edit` | Targeted text replacement |
| `find` | Search files by glob pattern |
| `ls` | List directory contents |

## Execution & Shell

| Tool | Purpose |
|---|---|
| `bash` | Run shell commands with optional timeout |

## Task & Workflow

| Tool | Purpose |
|---|---|
| `todo` | Create, update, list, and track tasks |

## User Interaction

| Tool | Purpose |
|---|---|
| `ask_user_question` | Structured single-select or multi-select questions |

## Subagents

| Tool | Purpose |
|---|---|
| `subagent` | Dispatch a typed subagent |
| `get_subagent_result` | Check status or retrieve subagent results |
| `steer_subagent` | Send a mid-run message to a subagent |

## Research

| Tool | Purpose |
|---|---|
| `web_search` | Search the open web |
| `web_fetch` | Fetch and read a specific URL |

## Visual Companion

| Tool | Purpose |
|---|---|
| `visual_companion_start` | Start a browser session |
| `visual_companion_show` | Push an HTML screen to the browser |
| `visual_companion_wait` | Block until the user confirms |
| `visual_companion_read_events` | Read browser interaction events |
| `visual_companion_stop` | Stop the browser session |

## MCP Gateway

| Tool | Purpose |
|---|---|
| `mcp` | Connect to MCP servers and call their tools |
