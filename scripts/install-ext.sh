#!/usr/bin/env bash
# Install pi extensions.
# Can be run directly: ./scripts/install-ext.sh [--exclude-ext foo,bar]

set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SCRIPT_DIR/scripts/common.sh"
parse_args "$@"

should_sync_category "extensions" || exit 0

EXT_SRC="$SCRIPT_DIR/pi-extensions"
EXT_DEST="$HOME/.pi/agent/extensions"

echo "==> Installing pi extensions to $EXT_DEST"

# Remove existing symlink or directory
if [[ -L "$EXT_DEST" ]]; then
	echo "    removing existing symlink: $EXT_DEST"
	rm "$EXT_DEST"
elif [[ -d "$EXT_DEST" ]]; then
	echo "    removing existing directory: $EXT_DEST"
	rm -rf "$EXT_DEST"
fi

# Create fresh destination directory
mkdir -p "$EXT_DEST"

# Copy all extensions, excluding node_modules at any depth
echo "    copying from $EXT_SRC"
if command -v rsync &>/dev/null; then
    rsync -a --exclude='node_modules' "$EXT_SRC"/ "$EXT_DEST"/
else
    cd "$EXT_SRC"
    find . -type d -name node_modules -prune -o -type f -print | \
        while IFS= read -r file; do
            mkdir -p "$EXT_DEST/$(dirname "$file")"
            cp "$file" "$EXT_DEST/$file"
        done
    cd - >/dev/null
fi

# Apply item-level filtering
for ext_dir in "$EXT_DEST"/*/; do
    ext_name=$(basename "$ext_dir")
    if ! should_sync_item "$ext_name" "$INCLUDE_EXT" "$EXCLUDE_EXT"; then
        echo "    filtering out extension: $ext_name"
        rm -rf "$ext_dir"
    fi
done

echo "==> Installing dependencies for extensions..."
for ext_dir in "$EXT_DEST"/*/; do
    if [[ -f "$ext_dir/package.json" ]]; then
        ext_name=$(basename "$ext_dir")
        echo "    $ext_name"
        if command -v bun &>/dev/null; then
            (cd "$ext_dir" && bun install --production)
        elif command -v npm &>/dev/null; then
            (cd "$ext_dir" && npm ci --production)
        else
            echo "    WARNING: no package manager found, skipping $ext_name"
        fi
    fi
done

echo "==> Installed extensions:"
ls -1 "$EXT_DEST"
