#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

# install.sh - copy pi extensions and skills from configure repo into ~/.pi/agent
# Usage: ./install.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Extensions ──

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

# Copy all extensions (directories and .json files), excluding node_modules
echo "    copying from $EXT_SRC"
for item in "$EXT_SRC"/*; do
    [[ "$(basename "$item")" == "node_modules" ]] && continue
    cp -r "$item" "$EXT_DEST"/
done

echo "==> Installed extensions:"
ls -1 "$EXT_DEST"

# ── Skills ──

SKILL_SRC="$SCRIPT_DIR/pi-skills"
SKILL_DEST="$HOME/.pi/agent/skills"

if [[ -d "$SKILL_SRC" ]]; then
	echo ""
	echo "==> Installing pi skills to $SKILL_DEST"

	mkdir -p "$SKILL_DEST"

	# Copy each skill directory (merge, don't wipe existing skills)
	for skill_dir in "$SKILL_SRC"/*/; do
		skill_name="$(basename "$skill_dir")"
		echo "    installing skill group: $skill_name"
		rm -rf "$SKILL_DEST/$skill_name"
		cp -r "$skill_dir" "$SKILL_DEST/$skill_name"

		# If this is a group directory, also clean orphaned top-level copies of its children
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
fi

# ── Themes ──

THEME_SRC="$SCRIPT_DIR/pi-themes"
THEME_DEST="$HOME/.pi/agent/themes"
if [[ -d "$THEME_SRC" ]]; then
	echo ""
	echo "    copying themes from $THEME_SRC"
	mkdir -p "$THEME_DEST"
	cp -r "$THEME_SRC"/* "$THEME_DEST"/
fi

echo ""
echo "==> Done!"
