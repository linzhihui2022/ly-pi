#!/usr/bin/env bash
set -euo pipefail
DEST="$HOME/.pi/agent/extensions/my-visual-companion"
mkdir -p "$DEST"
cp dist/index.js my-visual-companion.json frame.html "$DEST"/
