#!/usr/bin/env bash
set -euo pipefail
DEST="$HOME/.pi/agent/extensions/my-html"
mkdir -p "$DEST"
cp dist/index.js my-html.json "$DEST"/
