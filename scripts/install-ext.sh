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

# Validate source directory
if [[ ! -d "$EXT_SRC" ]]; then
    echo "ERROR: source directory does not exist: $EXT_SRC"
    exit 1
fi

if [[ -z "$(ls -A "$EXT_SRC" 2>/dev/null)" ]]; then
    echo "ERROR: source directory is empty: $EXT_SRC"
    exit 1
fi

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
copy_ok=0
if command -v rsync &>/dev/null; then
    if rsync -a --exclude='node_modules' "$EXT_SRC"/ "$EXT_DEST"/; then
        copy_ok=1
    else
        echo "    WARNING: rsync failed, falling back to cp"
    fi
fi

if [[ $copy_ok -eq 0 ]]; then
    # Fallback: cp -R then prune node_modules
    cp -R "$EXT_SRC"/* "$EXT_DEST"/ 2>/dev/null || true
    find "$EXT_DEST" -type d -name node_modules -exec rm -rf {} + 2>/dev/null || true
fi

# Verify copy succeeded
if [[ -z "$(ls -A "$EXT_DEST" 2>/dev/null)" ]]; then
    echo "ERROR: copy failed — destination directory is empty: $EXT_DEST"
    exit 1
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
