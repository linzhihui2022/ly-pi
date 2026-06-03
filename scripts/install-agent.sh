#!/usr/bin/env bash
# Install pi agents.
# Can be run directly: ./scripts/install-agent.sh [--exclude-agent foo,bar]

set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SCRIPT_DIR/scripts/common.sh"
parse_args "$@"

should_sync_category "agents" || exit 0

AGENT_SRC="$SCRIPT_DIR/pi-agents"
AGENT_DEST="$HOME/.pi/agent/agents"

if [[ ! -d "$AGENT_SRC" ]]; then
    exit 0
fi

echo ""
echo "==> Installing pi agents to $AGENT_DEST"

mkdir -p "$AGENT_DEST"
rm -rf "$AGENT_DEST"/*.md

for agent_file in "$AGENT_SRC"/*.md; do
    agent_name="$(basename "$agent_file" .md)"
    if ! should_sync_item "$agent_name" "$INCLUDE_AGENT" "$EXCLUDE_AGENT"; then
        echo "    filtering out agent: $agent_name"
        continue
    fi
    cp "$agent_file" "$AGENT_DEST"/
done

echo "==> Installed agents:"
ls -1 "$AGENT_DEST"
