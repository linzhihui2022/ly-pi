#!/usr/bin/env bash
set -euo pipefail
DEST="$HOME/.pi/agent/themes"
mkdir -p "$DEST"
cp *.json "$DEST"/
