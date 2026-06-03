#!/usr/bin/env bash
# Install pi skills.
# Can be run directly: ./scripts/install-skill.sh [--exclude-skill foo,bar]

set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SCRIPT_DIR/scripts/common.sh"
parse_args "$@"

should_sync_category "skills" || exit 0

SKILL_SRC="$SCRIPT_DIR/pi-skills"
SKILL_DEST="$HOME/.pi/agent/skills"

if [[ ! -d "$SKILL_SRC" ]]; then
    exit 0
fi

echo ""
echo "==> Installing pi skills to $SKILL_DEST"

mkdir -p "$SKILL_DEST"

for skill_dir in "$SKILL_SRC"/*/; do
    skill_name="$(basename "$skill_dir")"
    if ! should_sync_item "$skill_name" "$INCLUDE_SKILL" "$EXCLUDE_SKILL"; then
        echo "    filtering out skill group: $skill_name"
        continue
    fi
    echo "    installing skill group: $skill_name"
    rm -rf "$SKILL_DEST/$skill_name"
    cp -r "$skill_dir" "$SKILL_DEST/$skill_name"

    # Clean orphaned top-level copies of children
    if [[ -d "$skill_dir" ]]; then
        for child in "$skill_dir"*/; do
            child_name="$(basename "$child")"
            if [[ -d "$SKILL_DEST/$child_name" ]] && [[ ! -d "$SKILL_SRC/$child_name" ]]; then
                echo "    cleaning orphaned top-level skill: $child_name"
                rm -rf "$SKILL_DEST/$child_name"
            fi
        done
    fi
done

echo "==> Installed skills:"
find "$SKILL_DEST" -name 'SKILL.md' -maxdepth 3 | sed 's|.*/skills/||;s|/SKILL.md||' | sort
