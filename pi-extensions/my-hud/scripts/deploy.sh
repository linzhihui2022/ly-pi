#!/usr/bin/env bash
set -euo pipefail
DEST="$HOME/.pi/agent/extensions/my-hud"
mkdir -p "$DEST"
cp dist/index.js "$DEST"/
