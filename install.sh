#!/usr/bin/env bash
set -euo pipefail

# install.sh - orchestrator that delegates to per-category install scripts
#
# Usage:
#   ./install.sh                          # sync everything
#   ./install.sh --only ext,skill         # whitelist categories
#   ./install.sh --skip theme,agent       # blacklist categories
#   ./install.sh --exclude-ext foo,bar    # exclude specific extensions
#   ./install.sh --include-skill my-*     # include only matching skills
#
# Category aliases:
#   ext, extension, extensions
#   skill, skills
#   theme, themes
#   agent, agents

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Intercept --help before delegating to sub-scripts to avoid duplicate output
for arg in "$@"; do
    if [[ "$arg" == "--help" || "$arg" == "-h" ]]; then
        source "$SCRIPT_DIR/scripts/common.sh"
        print_help
        exit 0
    fi
done

for script in "$SCRIPT_DIR"/scripts/install-*.sh; do
    bash "$script" "$@"
done

echo ""
echo "==> Done!"
