# Move Scripts into Workspaces — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert remaining `scripts/install-*.sh` into workspace packages orchestrated by Turborepo.

**Architecture:** Create workspace directories for pi-skills, pi-themes, pi-agents, mcp, settings — each with a `package.json` containing a `deploy` script. Root `deploy` simplifies to `turbo run deploy`.

**Tech Stack:** Bash (deploy scripts), Bun workspaces, Turborepo

---

### Task 1: Create workspace directories and move files

**Files:**
- Create: `mcp/`, `settings/` directories
- Move: `mcp.json` → `mcp/mcp.json`
- Move: `settings.json` → `settings/settings.json`

- [ ] **Step 1: Create directories and move files**

```bash
cd /Users/lychee/Documents/configure
mkdir -p mcp settings
mv mcp.json mcp/mcp.json
mv settings.json settings/settings.json
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "refactor: move mcp.json and settings.json into workspace dirs"
```

---

### Task 2: Create package.json for all new workspaces

**Files:**
- Create: `pi-skills/package.json`
- Create: `pi-themes/package.json`
- Create: `pi-agents/package.json`
- Create: `mcp/package.json`
- Create: `settings/package.json`

- [ ] **Step 1: Write pi-skills/package.json**

```jsonc
{
  "name": "pi-skills",
  "private": true,
  "scripts": {
    "deploy": "for dir in */; do skill=$(basename \"$dir\"); rm -rf \"$HOME/.pi/agent/skills/$skill\"; cp -r \"$dir\" \"$HOME/.pi/agent/skills/$skill\"; done"
  }
}
```

- [ ] **Step 2: Write pi-themes/package.json**

```jsonc
{
  "name": "pi-themes",
  "private": true,
  "scripts": {
    "deploy": "mkdir -p $HOME/.pi/agent/themes && cp *.json $HOME/.pi/agent/themes/"
  }
}
```

- [ ] **Step 3: Write pi-agents/package.json**

```jsonc
{
  "name": "pi-agents",
  "private": true,
  "scripts": {
    "deploy": "mkdir -p $HOME/.pi/agent/agents && cp -r ./* $HOME/.pi/agent/agents/ 2>/dev/null; true"
  }
}
```

- [ ] **Step 4: Write mcp/package.json**

```jsonc
{
  "name": "mcp",
  "private": true,
  "scripts": {
    "deploy": "mkdir -p $HOME/.pi/agent && cp mcp.json $HOME/.pi/agent/mcp.json"
  }
}
```

- [ ] **Step 5: Write settings/package.json**

```jsonc
{
  "name": "settings",
  "private": true,
  "scripts": {
    "deploy": "scripts/merge-settings.sh"
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add pi-skills/package.json pi-themes/package.json pi-agents/package.json mcp/package.json settings/package.json
git commit -m "feat: add package.json for skills, themes, agents, mcp, settings workspaces"
```

---

### Task 3: Extract merge-settings.sh and delete old scripts

**Files:**
- Create: `scripts/merge-settings.sh`
- Delete: `scripts/install-skill.sh`, `scripts/install-theme.sh`, `scripts/install-agent.sh`, `scripts/install-mcp.sh`, `scripts/install-settings.sh`, `scripts/install-ext.sh`, `scripts/install-tool-display-config.sh`, `scripts/common.sh`
- Delete: `scripts/` directory

- [ ] **Step 1: Write scripts/merge-settings.sh**

Write `scripts/merge-settings.sh`:

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

- [ ] **Step 2: Make it executable and delete old scripts**

```bash
cd /Users/lychee/Documents/configure
chmod +x scripts/merge-settings.sh
rm scripts/install-skill.sh scripts/install-theme.sh scripts/install-agent.sh scripts/install-mcp.sh scripts/install-settings.sh scripts/install-ext.sh scripts/install-tool-display-config.sh scripts/common.sh
rmdir scripts
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: replace install scripts with workspace deploy scripts"
```

---

### Task 4: Update root package.json and bun install

**Files:**
- Modify: `package.json`
- Modify: `bun.lock` (auto via `bun install`)

- [ ] **Step 1: Update root package.json**

Current root package.json:
```jsonc
{
  "private": true,
  "packageManager": "bun@1.3.8",
  "workspaces": [
    "pi-extensions/*",
    "pi-config"
  ],
  "scripts": {
    "deploy": "turbo run deploy && bun run deploy:skills && bun run deploy:themes && bun run deploy:settings && bun run deploy:mcp",
    "deploy:skills": "scripts/install-skill.sh",
    "deploy:themes": "scripts/install-theme.sh",
    "deploy:settings": "scripts/install-settings.sh",
    "deploy:mcp": "scripts/install-mcp.sh"
  },
  "devDependencies": {
    "turbo": "^2",
    "@vitest/coverage-v8": "^4.1.7"
  }
}
```

Replace with:
```jsonc
{
  "private": true,
  "packageManager": "bun@1.3.8",
  "workspaces": [
    "pi-extensions/*",
    "pi-config",
    "pi-skills",
    "pi-themes",
    "pi-agents",
    "mcp",
    "settings"
  ],
  "scripts": {
    "deploy": "turbo run deploy"
  },
  "devDependencies": {
    "turbo": "^2",
    "@vitest/coverage-v8": "^4.1.7"
  }
}
```

- [ ] **Step 2: Run bun install**

```bash
cd /Users/lychee/Documents/configure
bun install
```

Expected: updates `bun.lock` with new workspace entries. No errors.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "feat: add new workspaces to root config, simplify deploy to turbo only"
```

---

### Task 5: Verify deploy works

- [ ] **Step 1: Run full deploy**

```bash
cd /Users/lychee/Documents/configure
bun run deploy 2>&1
```

Expected: All 11 workspaces run their deploy scripts successfully (5 extensions + pi-config + pi-skills + pi-themes + pi-agents + mcp + settings).

- [ ] **Step 2: Verify deployed artifacts**

```bash
# Check extensions
ls ~/.pi/agent/extensions/my-html/index.js && echo "my-html deployed"
ls ~/.pi/agent/extensions/my-hud/index.js && echo "my-hud deployed"
ls ~/.pi/agent/extensions/my-visual-companion/index.js && echo "my-visual-companion deployed"
ls ~/.pi/agent/extensions/my-webtool/index.js && echo "my-webtool deployed"
ls ~/.pi/agent/extensions/my-bt/index.js && echo "my-bt deployed"

# Check pi-config
ls ~/.pi/agent/extensions/pi-permission-system/config.json && echo "pi-permission-system deployed"
ls ~/.pi/agent/extensions/pi-tool-display/config.json && echo "pi-tool-display deployed"

# Check skills
ls ~/.pi/agent/skills/brainstorming/SKILL.md && echo "skills deployed"

# Check themes
ls ~/.pi/agent/themes/catppuccin-mocha.json && echo "themes deployed"

# Check mcp
ls ~/.pi/agent/mcp.json && echo "mcp deployed"

# Check settings
ls ~/.pi/agent/settings.json && echo "settings merged"
```

---

### Task 6: Update install.sh and documentation

**Files:**
- Modify: `install.sh`
- Modify: `README.md`

- [ ] **Step 1: Verify install.sh is already correct**

```bash
cat /Users/lychee/Documents/configure/install.sh
```

Expected output (from previous migration):
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
echo "==> Building and deploying..."
bun run deploy
echo ""
echo "==> Done!"
```

If it differs, update to match.

- [ ] **Step 2: Update README.md table**

The README's "Files" table should reflect new workspace structure. Update the `pi-extensions/`, `pi-skills/`, `pi-themes/` rows to note they're now Bun workspaces. Add rows for `mcp/` and `settings/`.

- [ ] **Step 3: Update AGENTS.md if needed**

Check if AGENTS.md references old `scripts/` paths or old deploy commands. Update if found.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: update README and install.sh for workspaces-only deploy"
```

---

### Task 7: Final verification

- [ ] **Step 1: Full clean run**

```bash
cd /Users/lychee/Documents/configure
bunx turbo run deploy --force 2>&1
```

Expected: All workspaces deploy successfully. Extensions go through build → test → deploy. Config-only workspaces go straight to deploy.

- [ ] **Step 2: Verify cache works for non-extension workspaces**

```bash
bunx turbo run deploy 2>&1
```

Expected: Extensions show `(cached)` for build/test, deploy always runs (cache: false).

- [ ] **Step 3: Check git status is clean**

```bash
git status
```

Expected: clean working tree.
