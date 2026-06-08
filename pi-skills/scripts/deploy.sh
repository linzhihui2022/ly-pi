#!/usr/bin/env bash
set -euo pipefail
DEST="$HOME/.pi/agent/skills"
cd skills
for dir in */; do
    skill=$(basename "$dir")
    [ "$skill" = "scripts" ] && continue
    rm -rf "$DEST/$skill"
    cp -r "$dir" "$DEST/$skill"
done
