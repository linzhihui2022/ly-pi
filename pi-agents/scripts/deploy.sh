#!/usr/bin/env bash
set -euo pipefail
DEST="$HOME/.pi/agent/agents"
mkdir -p "$DEST"
cp -r ./* "$DEST"/ 2>/dev/null || true
