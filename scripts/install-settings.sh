#!/usr/bin/env bash
# Merge settings.json into ~/.pi/agent/settings.json (deep merge, not overwrite).
# Runs unconditionally — settings are not a skippable category.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$SCRIPT_DIR/settings.json"
DEST="$HOME/.pi/agent/settings.json"

[[ -f "$SRC" ]] || { echo "    settings.json not found at $SRC, skipping"; exit 0; }

echo "==> Merging settings"

if [[ ! -f "$DEST" ]]; then
    echo "    creating $DEST"
    cp "$SRC" "$DEST"
    exit 0
fi

merge_json() {
    local src="$1"
    local dest="$2"

    if command -v jq &>/dev/null; then
        # jq object multiplication is a recursive merge (right-hand wins on conflicts)
        jq -s '.[0] * .[1]' "$dest" "$src" > "$dest.tmp" && mv "$dest.tmp" "$DEST"
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
' "$dest" "$src"
    else
        echo "    ERROR: neither jq nor python3 found; cannot merge settings.json"
        exit 1
    fi
}

merge_json "$SRC" "$DEST"
echo "    merged into $DEST"
