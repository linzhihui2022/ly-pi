# Turborepo Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up Turborepo + Bun workspaces to manage pi-extensions with a unified build-test-deploy pipeline.

**Architecture:** Bun workspaces (`pi-extensions/*`) with shared `node_modules` and single `bun.lock`. Turborepo orchestrates `build (bun build) → test (vitest) → deploy (cp)`. Config-only extensions merged into `pi-config`. Skills/themes deploy via existing shell scripts, chained after `turbo run deploy`.

**Tech Stack:** Bun (runtime + package manager), Turborepo 2.x, Vitest, TypeScript

---

### Task 1: Clean up existing node_modules and lockfiles

**Files:**
- Delete: `pi-extensions/*/node_modules/`
- Delete: `pi-extensions/node_modules/`
- Delete: `pi-extensions/*/bun.lock`
- Delete: root `package-lock.json`

- [ ] **Step 1: Remove per-extension node_modules**

```bash
cd /Users/lychee/Documents/configure
rm -rf pi-extensions/my-html/node_modules
rm -rf pi-extensions/my-hud/node_modules
rm -rf pi-extensions/my-visual-companion/node_modules
rm -rf pi-extensions/my-webtool/node_modules
rm -rf pi-extensions/my-bt/node_modules
rm -rf pi-extensions/node_modules
```

- [ ] **Step 2: Remove per-extension bun.lock and root package-lock.json**

```bash
cd /Users/lychee/Documents/configure
rm -f pi-extensions/my-html/bun.lock
rm -f pi-extensions/my-hud/bun.lock
rm -f pi-extensions/my-visual-companion/bun.lock
rm -f pi-extensions/my-webtool/bun.lock
rm -f package-lock.json
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove per-extension node_modules and lockfiles for workspaces migration"
```

---

### Task 2: Create pi-config workspace

**Files:**
- Create: `pi-extensions/pi-config/package.json`
- Move: `pi-extensions/pi-permission-system/config.json` → `pi-extensions/pi-config/pi-permission-system.json`
- Move: `pi-extensions/pi-tool-display/config.json` → `pi-extensions/pi-config/pi-tool-display.json`
- Delete: `pi-extensions/pi-permission-system/`
- Delete: `pi-extensions/pi-tool-display/`

- [ ] **Step 1: Create pi-config directory**

```bash
cd /Users/lychee/Documents/configure
mkdir -p pi-extensions/pi-config
```

- [ ] **Step 2: Move config files and remove old dirs**

```bash
cd /Users/lychee/Documents/configure
mv pi-extensions/pi-permission-system/config.json pi-extensions/pi-config/pi-permission-system.json
mv pi-extensions/pi-tool-display/config.json pi-extensions/pi-config/pi-tool-display.json
rmdir pi-extensions/pi-permission-system
rmdir pi-extensions/pi-tool-display
```

- [ ] **Step 3: Write pi-config/package.json**

Write `pi-extensions/pi-config/package.json`:

```jsonc
{
  "name": "pi-config",
  "private": true,
  "scripts": {
    "deploy": "bun run deploy:permission && bun run deploy:tool-display",
    "deploy:permission": "mkdir -p $HOME/.pi/agent/extensions/pi-permission-system && cp pi-permission-system.json $HOME/.pi/agent/extensions/pi-permission-system/config.json",
    "deploy:tool-display": "mkdir -p $HOME/.pi/agent/extensions/pi-tool-display && cp pi-tool-display.json $HOME/.pi/agent/extensions/pi-tool-display/config.json"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(pi-config): merge config-only extensions into pi-config workspace"
```

---

### Task 3: Add package.json for my-bt

**Files:**
- Create: `pi-extensions/my-bt/package.json`

- [ ] **Step 1: Write my-bt/package.json**

Write `pi-extensions/my-bt/package.json`:

```jsonc
{
  "name": "my-bt",
  "module": "index.ts",
  "type": "module",
  "scripts": {
    "build": "bun build ./index.ts --outdir dist --target node --format esm --external '@earendil-works/*'",
    "test": "vitest run --coverage",
    "deploy": "mkdir -p $HOME/.pi/agent/extensions/my-bt && cp dist/index.js my-bt.json $HOME/.pi/agent/extensions/my-bt/ && cp sounds/*.wav $HOME/.pi/agent/extensions/my-bt/sounds/ 2>/dev/null; true"
  },
  "devDependencies": {
    "vitest": "^4"
  }
}
```

my-bt has no external dependencies beyond vitest for testing and the Bun built-in APIs it uses (`Bun.file`, audio playback).

- [ ] **Step 2: Commit**

```bash
git add pi-extensions/my-bt/package.json
git commit -m "feat(my-bt): add package.json for workspaces integration"
```

---

### Task 4: Update root package.json

**Files:**
- Modify: `package.json` (full rewrite)

- [ ] **Step 1: Read current root package.json**

```bash
cat /Users/lychee/Documents/configure/package.json
```

Current content:
```jsonc
{
  "devDependencies": {
    "@vitest/coverage-v8": "^4.1.7"
  }
}
```

- [ ] **Step 2: Write updated root package.json**

Write `package.json`:

```jsonc
{
  "private": true,
  "workspaces": ["pi-extensions/*"],
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

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add workspaces config and turbo dependency to root package.json"
```

---

### Task 5: Update extension package.json files with build/test/deploy scripts

**Files:**
- Modify: `pi-extensions/my-html/package.json`
- Modify: `pi-extensions/my-hud/package.json`
- Modify: `pi-extensions/my-visual-companion/package.json`
- Modify: `pi-extensions/my-webtool/package.json`

- [ ] **Step 1: Update my-html/package.json**

Current my-html/package.json:
```jsonc
{
  "name": "my-html",
  "module": "index.ts",
  "type": "module",
  "dependencies": {
    "highlight.js": "^11.11.0",
    "marked": "^15.0.0",
    "marked-highlight": "^2.2.0",
    "open": "^10.0.0",
    "github-markdown-css": "^5.8.1"
  },
  "devDependencies": {
    "@earendil-works/pi-ai": "^0.78.0",
    "@earendil-works/pi-coding-agent": "^0.78.0",
    "@types/node": "^25.9.1"
  },
  "peerDependencies": {
    "typescript": "^5"
  }
}
```

Write updated `pi-extensions/my-html/package.json`:

```jsonc
{
  "name": "my-html",
  "module": "index.ts",
  "type": "module",
  "scripts": {
    "build": "bun build ./index.ts --outdir dist --target node --format esm --external '@earendil-works/*'",
    "test": "vitest run --coverage",
    "deploy": "mkdir -p $HOME/.pi/agent/extensions/my-html && cp dist/index.js my-html.json $HOME/.pi/agent/extensions/my-html/"
  },
  "dependencies": {
    "highlight.js": "^11.11.0",
    "marked": "^15.0.0",
    "marked-highlight": "^2.2.0",
    "open": "^10.0.0",
    "github-markdown-css": "^5.8.1"
  },
  "devDependencies": {
    "@earendil-works/pi-ai": "^0.78.0",
    "@earendil-works/pi-coding-agent": "^0.78.0",
    "@types/node": "^25.9.1",
    "vitest": "^4"
  },
  "peerDependencies": {
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Update my-hud/package.json**

Current my-hud/package.json:
```jsonc
{
  "name": "my-hud",
  "module": "index.ts",
  "type": "module",
  "devDependencies": {
    "@types/bun": "latest"
  },
  "peerDependencies": {
    "typescript": "^5"
  },
  "dependencies": {
    "@earendil-works/pi-ai": "^0.78.0",
    "@earendil-works/pi-coding-agent": "^0.78.0",
    "@earendil-works/pi-tui": "^0.78.0",
    "@types/node": "^25.9.1"
  }
}
```

Write updated `pi-extensions/my-hud/package.json`:

```jsonc
{
  "name": "my-hud",
  "module": "index.ts",
  "type": "module",
  "scripts": {
    "build": "bun build ./index.ts --outdir dist --target node --format esm --external '@earendil-works/*'",
    "test": "vitest run --coverage",
    "deploy": "mkdir -p $HOME/.pi/agent/extensions/my-hud && cp dist/index.js $HOME/.pi/agent/extensions/my-hud/"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "vitest": "^4"
  },
  "peerDependencies": {
    "typescript": "^5"
  },
  "dependencies": {
    "@earendil-works/pi-ai": "^0.78.0",
    "@earendil-works/pi-coding-agent": "^0.78.0",
    "@earendil-works/pi-tui": "^0.78.0",
    "@types/node": "^25.9.1"
  }
}
```

Note: my-hud has no `.json` config file (unlike other extensions). Deploy only copies `dist/index.js`.

- [ ] **Step 3: Update my-visual-companion/package.json**

Current my-visual-companion/package.json:
```jsonc
{
  "name": "my-visual-companion",
  "module": "index.ts",
  "type": "module",
  "dependencies": {
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@earendil-works/pi-ai": "^0.78.0",
    "@earendil-works/pi-coding-agent": "^0.78.0",
    "@types/node": "^25.9.1",
    "@types/ws": "^8.5.13"
  }
}
```

Write updated `pi-extensions/my-visual-companion/package.json`:

```jsonc
{
  "name": "my-visual-companion",
  "module": "index.ts",
  "type": "module",
  "scripts": {
    "build": "bun build ./index.ts --outdir dist --target node --format esm --external '@earendil-works/*'",
    "test": "vitest run --coverage",
    "deploy": "mkdir -p $HOME/.pi/agent/extensions/my-visual-companion && cp dist/index.js my-visual-companion.json frame.html $HOME/.pi/agent/extensions/my-visual-companion/"
  },
  "dependencies": {
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@earendil-works/pi-ai": "^0.78.0",
    "@earendil-works/pi-coding-agent": "^0.78.0",
    "@types/node": "^25.9.1",
    "@types/ws": "^8.5.13",
    "vitest": "^4"
  }
}
```

Note: my-visual-companion has `frame.html` that needs to be copied in deploy.

- [ ] **Step 4: Update my-webtool/package.json**

Current my-webtool/package.json:
```jsonc
{
  "name": "my-webtool",
  "module": "index.ts",
  "type": "module",
  "devDependencies": {
    "@types/bun": "latest"
  },
  "peerDependencies": {
    "typescript": "^5"
  },
  "dependencies": {
    "@earendil-works/pi-ai": "^0.78.0",
    "@earendil-works/pi-coding-agent": "^0.78.0",
    "@earendil-works/pi-tui": "^0.78.0",
    "@types/node": "^25.9.1",
    "openai": "^6.42.0",
    "typebox": "^1.1.39"
  }
}
```

Write updated `pi-extensions/my-webtool/package.json`:

```jsonc
{
  "name": "my-webtool",
  "module": "index.ts",
  "type": "module",
  "scripts": {
    "build": "bun build ./index.ts --outdir dist --target node --format esm --external '@earendil-works/*'",
    "test": "vitest run --coverage",
    "deploy": "mkdir -p $HOME/.pi/agent/extensions/my-webtool && cp dist/index.js my-webtool.json $HOME/.pi/agent/extensions/my-webtool/"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "vitest": "^4"
  },
  "peerDependencies": {
    "typescript": "^5"
  },
  "dependencies": {
    "@earendil-works/pi-ai": "^0.78.0",
    "@earendil-works/pi-coding-agent": "^0.78.0",
    "@earendil-works/pi-tui": "^0.78.0",
    "@types/node": "^25.9.1",
    "openai": "^6.42.0",
    "typebox": "^1.1.39"
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-html/package.json pi-extensions/my-hud/package.json pi-extensions/my-visual-companion/package.json pi-extensions/my-webtool/package.json
git commit -m "feat: add build/test/deploy scripts to all extension packages"
```

---

### Task 6: Run bun install to create unified lockfile

**Files:**
- Create: `bun.lock`
- Create: root `node_modules/`

- [ ] **Step 1: Run bun install**

```bash
cd /Users/lychee/Documents/configure
bun install
```

Expected: installs all workspace packages, creates root `node_modules/` and `bun.lock`. No errors.

- [ ] **Step 2: Verify workspace structure**

```bash
cd /Users/lychee/Documents/configure
ls node_modules/@earendil-works/ 2>/dev/null && echo "pi SDK found in root node_modules"
ls node_modules/vitest/ 2>/dev/null && echo "vitest found in root node_modules"
ls node_modules/highlight.js/ 2>/dev/null && echo "highlight.js (my-html dep) found in root node_modules"
```

Expected: shared dependencies are hoisted to root node_modules.

- [ ] **Step 3: Commit**

```bash
git add bun.lock
git commit -m "chore: add unified bun.lock for workspaces"
```

Note: `node_modules/` is already gitignored.

---

### Task 7: Create turbo.json

**Files:**
- Create: `turbo.json`

- [ ] **Step 1: Write turbo.json**

Write `turbo.json`:

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", "!*.test.ts", "!*.spec.ts"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "inputs": ["$TURBO_DEFAULT$", "dist/**"],
      "outputs": ["coverage/**"]
    },
    "deploy": {
      "dependsOn": ["test"],
      "cache": false
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add turbo.json
git commit -m "feat: add turbo.json with build-test-deploy pipeline"
```

---

### Task 8: Verify build works

**Files:**
- Create: `pi-extensions/*/dist/` (build output, gitignored)

- [ ] **Step 1: Run build via turbo**

```bash
cd /Users/lychee/Documents/configure
bunx turbo run build
```

Expected: All 5 extension packages (my-html, my-hud, my-visual-companion, my-webtool, my-bt) build successfully. pi-config is skipped (no build script). Output similar to:

```
Tasks:    5 successful, 5 total
Cached:   0 cached, 5 total
```

- [ ] **Step 2: Verify build outputs**

```bash
cd /Users/lychee/Documents/configure
ls pi-extensions/my-html/dist/index.js && echo "my-html built"
ls pi-extensions/my-hud/dist/index.js && echo "my-hud built"
ls pi-extensions/my-visual-companion/dist/index.js && echo "my-visual-companion built"
ls pi-extensions/my-webtool/dist/index.js && echo "my-webtool built"
ls pi-extensions/my-bt/dist/index.js && echo "my-bt built"
```

Expected: All five output `dist/index.js` files exist.

- [ ] **Step 3: Commit**

```bash
# Nothing to commit (dist/ is gitignored), just verify
git status
```

---

### Task 9: Verify tests pass

- [ ] **Step 1: Run tests via turbo**

```bash
cd /Users/lychee/Documents/configure
bunx turbo run test
```

Expected: All test suites pass. Builds are cached (no rebuild unless source changed). Output similar to:

```
my-html:test: ... (cached)      # if no source changes since Task 8
my-bt:test: ✓ 5 tests passed
...
Tasks:    5 successful, 5 total
Cached:   5 cached, 5 total     # builds cached from Task 8
```

- [ ] **Step 2: If any test fails, investigate and fix**

Check the failing package's test output. If it's a path or import issue caused by the workspaces migration, fix in the relevant test file.

- [ ] **Step 3: Commit any test fixes if needed**

```bash
git add -A
git commit -m "fix: update test paths for workspaces structure"
```

(Only if fixes were needed.)

---

### Task 10: Verify deploy works

- [ ] **Step 1: Run deploy via root script**

```bash
cd /Users/lychee/Documents/configure
bun run deploy
```

Expected: Deploys extensions (from dist/) + pi-config + skills + themes to `~/.pi/agent/`. Output shows successful copies.

- [ ] **Step 2: Verify deployed files**

```bash
ls ~/.pi/agent/extensions/my-html/index.js && echo "my-html deployed"
ls ~/.pi/agent/extensions/my-html/my-html.json && echo "my-html config deployed"
ls ~/.pi/agent/extensions/my-hud/index.js && echo "my-hud deployed"
ls ~/.pi/agent/extensions/my-visual-companion/index.js && echo "my-visual-companion deployed"
ls ~/.pi/agent/extensions/my-visual-companion/frame.html && echo "my-visual-companion frame deployed"
ls ~/.pi/agent/extensions/my-webtool/index.js && echo "my-webtool deployed"
ls ~/.pi/agent/extensions/my-bt/index.js && echo "my-bt deployed"
ls ~/.pi/agent/extensions/pi-permission-system/config.json && echo "pi-permission-system deployed"
ls ~/.pi/agent/extensions/pi-tool-display/config.json && echo "pi-tool-display deployed"
ls ~/.pi/agent/skills/brainstorming/SKILL.md && echo "skills deployed"
ls ~/.pi/agent/themes/catppuccin-mocha.json && echo "themes deployed"
```

---

### Task 11: Simplify install.sh

**Files:**
- Modify: `install.sh`

- [ ] **Step 1: Read current install.sh to understand what to preserve**

Current install.sh delegates to `scripts/install-*.sh` with CLI argument parsing.

- [ ] **Step 2: Write simplified install.sh**

Write `install.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# install.sh — deploy pi extensions, skills, themes, and settings
# Thin wrapper over turbo run deploy + shell scripts

cd "$(dirname "${BASH_SOURCE[0]}")"

echo "==> Building and deploying..."
bun run deploy

echo ""
echo "==> Done!"
```

- [ ] **Step 3: Make install.sh executable**

```bash
chmod +x /Users/lychee/Documents/configure/install.sh
```

- [ ] **Step 4: Test install.sh**

```bash
cd /Users/lychee/Documents/configure
./install.sh
```

Expected: Same output as `bun run deploy` from Task 10.

- [ ] **Step 5: Commit**

```bash
git add install.sh
git commit -m "refactor(install): simplify to turbo deploy wrapper"
```

---

### Task 12: Update .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add turbo and dist entries to .gitignore**

Current `.gitignore`:
```
.worktrees/
.worktree/

# Dependencies
node_modules/

# Pi runtime artifacts
.pi-lens/
.pi/
.rpiv/

# Test coverage
coverage/
.env
```

Append to `.gitignore`:

```
# Turborepo
.turbo/

# Build outputs
pi-extensions/*/dist/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add .turbo/ and dist/ to gitignore"
```

---

### Task 13: Verify full pipeline end-to-end

- [ ] **Step 1: Verify turbo cache works**

```bash
cd /Users/lychee/Documents/configure
bunx turbo run build
```

Expected: All builds show `(cached)` since source hasn't changed since Task 8.

- [ ] **Step 2: Verify turbo test with cached builds**

```bash
bunx turbo run test
```

Expected: Both builds and tests show `(cached)`.

- [ ] **Step 3: Verify cache invalidation on source change**

```bash
# Touch a source file to invalidate cache
touch pi-extensions/my-html/index.ts
bunx turbo run build --filter=my-html
```

Expected: Only my-html rebuilds (not cached), others show `(cached)`.

- [ ] **Step 4: Revert test change**

```bash
git checkout pi-extensions/my-html/index.ts
```

---

### Task 14: Final commit and cleanup

- [ ] **Step 1: Check git status**

```bash
cd /Users/lychee/Documents/configure
git status
```

Expected: Clean working tree (no uncommitted changes).

- [ ] **Step 2: Verify nothing broken**

```bash
cd /Users/lychee/Documents/configure
bunx turbo run test
```

Expected: All passed, all cached.
