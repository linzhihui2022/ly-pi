#!/usr/bin/env bash
# Install mcp.json configuration.
# Can be run directly: ./scripts/install-mcp.sh

set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SCRIPT_DIR/scripts/common.sh"
parse_args "$@"

should_sync_category "mcp" || exit 0

MCP_SRC="$SCRIPT_DIR/mcp.json"
MCP_DEST="$HOME/.pi/agent/mcp.json"

if [[ ! -f "$MCP_SRC" ]]; then
    exit 0
fi

echo ""
echo "==> Installing mcp.json to $MCP_DEST"

cp "$MCP_SRC" "$MCP_DEST"

echo "==> Installed mcp.json"
