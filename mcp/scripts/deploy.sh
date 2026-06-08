#!/usr/bin/env bash
set -euo pipefail
DEST="$HOME/.pi/agent"
mkdir -p "$DEST"
cp mcp.json "$DEST/mcp.json"
