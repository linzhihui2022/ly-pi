# Move Scripts into Workspaces

## Overview

Convert remaining deploy scripts (`scripts/install-*.sh`) into workspace packages that Turborepo can orchestrate. Each category (skills, themes, agents, mcp, settings) becomes its own workspace with a `deploy` script. The root `deploy` command simplifies to `turbo run deploy`.

## Structure

```
configure/
├── pi-extensions/          # workspace: 5 extensions (build → test → deploy)
├── pi-config/              # workspace: config-only deployment
├── pi-skills/              # workspace: 14 skills → cp -r
├── pi-themes/              # workspace: 1 theme → cp
├── pi-agents/              # workspace: custom agents → cp
├── mcp/                    # workspace: single mcp.json → cp
├── settings/               # workspace: single settings.json → deep merge
```

## Root package.json

Workspaces field:
```jsonc
"workspaces": [
  "pi-extensions/*",
  "pi-config",
  "pi-skills",
  "pi-themes",
  "pi-agents",
  "mcp",
  "settings"
]
```

Deploy script simplifies to:
```jsonc
"scripts": {
  "deploy": "turbo run deploy"
}
```

## Workspace package.json Files

### pi-skills
```jsonc
{
  "name": "pi-skills",
  "private": true,
  "scripts": {
    "deploy": "for dir in */; do skill=$(basename \"$dir\"); rm -rf \"$HOME/.pi/agent/skills/$skill\"; cp -r \"$dir\" \"$HOME/.pi/agent/skills/$skill\"; done"
  }
}
```

### pi-themes
```jsonc
{
  "name": "pi-themes",
  "private": true,
  "scripts": {
    "deploy": "mkdir -p $HOME/.pi/agent/themes && cp *.json $HOME/.pi/agent/themes/"
  }
}
```

### pi-agents
```jsonc
{
  "name": "pi-agents",
  "private": true,
  "scripts": {
    "deploy": "mkdir -p $HOME/.pi/agent/agents && cp -r ./* $HOME/.pi/agent/agents/ 2>/dev/null; true"
  }
}
```

### mcp
- Move `mcp.json` from repo root to `mcp/mcp.json`
```jsonc
{
  "name": "mcp",
  "private": true,
  "scripts": {
    "deploy": "mkdir -p $HOME/.pi/agent && cp mcp.json $HOME/.pi/agent/mcp.json"
  }
}
```

### settings
- Move `settings.json` from repo root to `settings/settings.json`
```jsonc
{
  "name": "settings",
  "private": true,
  "scripts": {
    "deploy": "scripts/merge-settings.sh"
  }
}
```

## settings Merge Script

Extract the core merge logic from `scripts/install-settings.sh` into `scripts/merge-settings.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SRC="settings.json"
DEST="$HOME/.pi/agent/settings.json"

mkdir -p "$(dirname "$DEST")"

if [[ ! -f "$DEST" ]]; then
    cp "$SRC" "$DEST"
    exit 0
fi

if command -v jq &>/dev/null; then
    jq -s '.[0] * .[1]' "$DEST" "$SRC" > "$DEST.tmp" && mv "$DEST.tmp" "$DEST"
elif command -v python3 &>/dev/null; then
    python3 -c '
import json, sys
def deep_merge(base, overlay):
    if isinstance(base, dict) and isinstance(overlay, dict):
        result = dict(base)
        for k, v in overlay.items():
            if k in result and isinstance(result[k], dict) and isinstance(v, dict):
                result[k] = deep_merge(result[k], v)
            else:
                result[k] = v
        return result
    return overlay
with open(sys.argv[1]) as f: base = json.load(f)
with open(sys.argv[2]) as f: overlay = json.load(f)
merged = deep_merge(base, overlay)
with open(sys.argv[1], "w") as f: json.dump(merged, f, indent=2, ensure_ascii=False)
f.write("\n")
' "$DEST" "$SRC"
else
    echo "ERROR: neither jq nor python3 found"
    exit 1
fi
```

## Files to Delete

- `scripts/common.sh` — argument parsing no longer needed
- `scripts/install-skill.sh` — replaced by pi-skills deploy
- `scripts/install-theme.sh` — replaced by pi-themes deploy
- `scripts/install-agent.sh` — replaced by pi-agents deploy
- `scripts/install-mcp.sh` — replaced by mcp deploy
- `scripts/install-settings.sh` — replaced by scripts/merge-settings.sh + settings deploy
- `scripts/install-ext.sh` — already deprecated (turbo handles extensions)
- `scripts/install-tool-display-config.sh` — already deprecated (pi-config handles it)
- `scripts/` directory itself — empty after cleanup

## turbo.json Changes

Add `cache: false` to the deploy task for all non-extension workspaces. The current turbo.json already has `"deploy": { "cache": false, ... }` which applies globally. No change needed.

## Migration Steps

1. Create `mcp/` and `settings/` directories
2. Move `mcp.json` → `mcp/mcp.json`
3. Move `settings.json` → `settings/settings.json`
4. Create `package.json` for pi-skills, pi-themes, pi-agents, mcp, settings
5. Extract `scripts/merge-settings.sh` from `scripts/install-settings.sh`
6. Delete `scripts/` (all scripts deprecated)
7. Update root `package.json`: expand workspaces, simplify deploy script
8. Run `bun install`, verify `turbo run deploy`
