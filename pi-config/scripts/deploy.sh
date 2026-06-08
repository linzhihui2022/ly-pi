#!/usr/bin/env bash
set -euo pipefail
DEST="$HOME/.pi/agent/extensions/pi-permission-system"
mkdir -p "$DEST"
cp pi-permission-system.json "$DEST/config.json"

DEST="$HOME/.pi/agent/extensions/pi-tool-display"
mkdir -p "$DEST"
cp pi-tool-display.json "$DEST/config.json"
