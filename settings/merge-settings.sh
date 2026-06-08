#!/usr/bin/env bash
set -euo pipefail

SRC="settings.json"
DEST="$HOME/.pi/agent/settings.json"

mkdir -p "$(dirname "$DEST")"

if [[ ! -f "$DEST" ]]; then
    cp "$SRC" "$DEST"
    exit 0
fi

if command -v jq &>/dev/null; then
    jq -s '.[0] * .[1]' "$DEST" "$SRC" > "$DEST.tmp" && mv "$DEST.tmp" "$DEST"
elif command -v python3 &>/dev/null; then
    python3 -c '
import json, sys
def deep_merge(base, overlay):
    if isinstance(base, dict) and isinstance(overlay, dict):
        result = dict(base)
        for k, v in overlay.items():
            if k in result and isinstance(result[k], dict) and isinstance(v, dict):
                result[k] = deep_merge(result[k], v)
            else:
                result[k] = v
        return result
    return overlay
with open(sys.argv[1]) as f: base = json.load(f)
with open(sys.argv[2]) as f: overlay = json.load(f)
merged = deep_merge(base, overlay)
with open(sys.argv[1], "w") as f: json.dump(merged, f, indent=2, ensure_ascii=False)
f.write("\n")
' "$DEST" "$SRC"
else
    echo "ERROR: neither jq nor python3 found"
    exit 1
fi
