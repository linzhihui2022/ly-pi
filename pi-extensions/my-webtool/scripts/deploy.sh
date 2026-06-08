#!/usr/bin/env bash
set -euo pipefail
DEST="$HOME/.pi/agent/extensions/my-webtool"
mkdir -p "$DEST"
cp dist/index.js my-webtool.json "$DEST"/
