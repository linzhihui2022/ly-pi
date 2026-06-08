#!/usr/bin/env bash
set -euo pipefail
DEST="$HOME/.pi/agent/extensions/my-bt"
mkdir -p "$DEST" "$DEST/sounds"
cp dist/index.js my-bt.json "$DEST"/
cp sounds/*.wav "$DEST/sounds/"
