#!/usr/bin/env bash
# Install pi themes.
# Can be run directly: ./scripts/install-theme.sh [--exclude-theme foo,bar]

set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SCRIPT_DIR/scripts/common.sh"
parse_args "$@"

should_sync_category "themes" || exit 0

THEME_SRC="$SCRIPT_DIR/pi-themes"
THEME_DEST="$HOME/.pi/agent/themes"

if [[ ! -d "$THEME_SRC" ]]; then
    exit 0
fi

echo ""
echo "==> Installing pi themes to $THEME_DEST"

mkdir -p "$THEME_DEST"

for theme_dir in "$THEME_SRC"/*/; do
    theme_name="$(basename "$theme_dir")"
    if ! should_sync_item "$theme_name" "$INCLUDE_THEME" "$EXCLUDE_THEME"; then
        echo "    filtering out theme: $theme_name"
        continue
    fi
    cp -r "$theme_dir" "$THEME_DEST"/
done
