#!/usr/bin/env bash
# Copy pi-tool-display config from example template if config.json
# does not already exist. This prevents overwriting user-customized
# config on re-install. Runs unconditionally (not filtered by
# --only/--skip) to ensure the default config is always seeded.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

EXAMPLE="$SCRIPT_DIR/pi-extensions/pi-tool-display/config.example.json"
DEST="$HOME/.pi/agent/extensions/pi-tool-display/config.json"

if [[ -f "$EXAMPLE" ]]; then
    if [[ -f "$DEST" ]]; then
        echo "==> pi-tool-display config already exists, skipping: $DEST"
    else
        echo "==> Installing pi-tool-display config: $DEST"
        mkdir -p "$(dirname "$DEST")"
        cp "$EXAMPLE" "$DEST"
    fi
fi
