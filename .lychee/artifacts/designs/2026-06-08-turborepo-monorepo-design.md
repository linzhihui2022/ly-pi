# Turborepo Monorepo Management Design

## Overview

Introduce Turborepo + Bun workspaces to manage pi-extensions, pi-skills, and pi-themes with a unified build-test-deploy pipeline.

## Directory Structure

```
configure/
├── package.json                # + "workspaces", "private": true, turbo dep
├── turbo.json                  # + task pipeline definition
├── bun.lock                    # ~ unified lockfile (replaces per-extension locks)
├── tsconfig.base.json          # + shared tsconfig base
│
├── pi-extensions/
│   ├── my-html/                # workspace package
│   │   ├── package.json        # ~ add build/test/deploy scripts
│   │   ├── index.ts
│   │   ├── dist/               # + build output (gitignored)
│   │   ├── node_modules/       # - removed, hoisted to root
│   │   └── bun.lock            # - removed, hoisted to root
│   ├── my-hud/                 (same pattern)
│   ├── my-visual-companion/    (same pattern)
│   ├── my-webtool/             (same pattern)
│   ├── my-bt/                  + add package.json
│   └── pi-config/              + new: merged config-only extensions
│       ├── package.json
│       ├── pi-permission-system.json
│       └── pi-tool-display.json
│
├── pi-skills/                  (unchanged)
├── pi-themes/                  (unchanged)
│
├── install.sh                  ~ simplified to turbo wrapper
└── .gitignore                  ~ add .turbo/, dist/
```

## Root package.json

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
    "@vitest/coverage-v8": "^4"
  }
}
```

## Extension package.json (example: my-html)

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
  "dependencies": { /* unchanged */ },
  "devDependencies": {
    /* existing + vitest */
    "vitest": "^4"
  }
}
```

All extensions follow the same pattern. pi SDK deps (`@earendil-works/*`) are marked external since pi runtime provides them.

## pi-config package.json

```jsonc
{
  "name": "pi-config",
  "private": true,
  "scripts": {
    "deploy": "bun run deploy:permission && bun run deploy:tool-display",
    "deploy:permission": "cp pi-permission-system.json $HOME/.pi/agent/extensions/pi-permission-system/",
    "deploy:tool-display": "cp pi-tool-display.json $HOME/.pi/agent/extensions/pi-tool-display/"
  }
}
```

Merges pi-permission-system and pi-tool-display into one workspace package. Each config gets its own `deploy:<name>` script, composed under `deploy`.

## turbo.json

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

Pipeline: `build → test → deploy`. Build and test are cached; deploy always runs.

Skills/themes deploy scripts are root-level and run after `turbo run deploy` completes.

## Build Details

- Command: `bun build ./index.ts --outdir dist --target node --format esm --external '@earendil-works/*'`
- Output: single `dist/index.js` per extension
- Non-TS assets (e.g., `frame.html` in my-visual-companion, `sounds/` in my-bt) are copied separately in deploy

## Deploy Details

| Package | Copies |
|---------|--------|
| my-html | `dist/index.js`, `my-html.json` |
| my-hud | `dist/index.js`, `my-hud.json` |
| my-visual-companion | `dist/index.js`, `my-visual-companion.json`, `frame.html` |
| my-webtool | `dist/index.js`, `my-webtool.json` |
| my-bt | `dist/index.js`, `my-bt.json`, `sounds/` |
| pi-config | individual `*.json` files |
| pi-skills | entire directories (via install-skill.sh) |
| pi-themes | json files (via install-theme.sh) |

## install.sh Transition

Final form - thin wrapper:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
bun run deploy
```

Existing `--only`/`--skip` filtering can be replaced with `turbo --filter` if needed.

## Migration Steps

1. **Clean up**: delete per-extension `node_modules/` and `bun.lock`, delete root `package-lock.json`
2. **Create pi-config**: new `pi-extensions/pi-config/` with merged JSON configs
3. **Add package.json**: for my-bt (missing)
4. **Update root package.json**: add `workspaces`, `private`, `turbo` dep, deploy scripts
5. **Update extension package.json**: add `build`/`test`/`deploy` scripts, add `vitest`
6. **Run `bun install`**: generates unified `bun.lock`
7. **Create `turbo.json`**: pipeline definition
8. **Verify**: `bun run build`, `bun run test`, `bun run deploy`
9. **Simplify `install.sh`**: to one-line wrapper
