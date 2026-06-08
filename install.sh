#!/usr/bin/env bash
set -euo pipefail

# install.sh — deploy pi extensions, skills, themes, and settings
# Thin wrapper over turbo run deploy + shell scripts

cd "$(dirname "${BASH_SOURCE[0]}")"

echo "==> Building and deploying..."
bun run deploy

echo ""
echo "==> Done!"
