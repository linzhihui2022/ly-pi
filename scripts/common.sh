#!/usr/bin/env bash
# Common utilities for install scripts.
# Usage: source "$(dirname "$0")/scripts/common.sh"

set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ONLY_CATEGORIES=""
SKIP_CATEGORIES=""
INCLUDE_EXT=""
EXCLUDE_EXT=""
INCLUDE_SKILL=""
EXCLUDE_SKILL=""
INCLUDE_THEME=""
EXCLUDE_THEME=""
INCLUDE_AGENT=""
EXCLUDE_AGENT=""

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --only)
                ONLY_CATEGORIES="$2"
                shift 2
                ;;
            --skip)
                SKIP_CATEGORIES="$2"
                shift 2
                ;;
            --include-ext)
                INCLUDE_EXT="$2"
                shift 2
                ;;
            --exclude-ext)
                EXCLUDE_EXT="$2"
                shift 2
                ;;
            --include-skill)
                INCLUDE_SKILL="$2"
                shift 2
                ;;
            --exclude-skill)
                EXCLUDE_SKILL="$2"
                shift 2
                ;;
            --include-theme)
                INCLUDE_THEME="$2"
                shift 2
                ;;
            --exclude-theme)
                EXCLUDE_THEME="$2"
                shift 2
                ;;
            --include-agent)
                INCLUDE_AGENT="$2"
                shift 2
                ;;
            --exclude-agent)
                EXCLUDE_AGENT="$2"
                shift 2
                ;;
            --help|-h)
                print_help
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                echo "Run $0 --help for usage."
                exit 1
                ;;
        esac
    done
}

print_help() {
    cat <<'EOF'
Usage:
  ./install.sh                          # sync everything
  ./install.sh --only ext,skill         # whitelist categories
  ./install.sh --skip theme,agent       # blacklist categories
  ./install.sh --exclude-ext foo,bar    # exclude specific extensions
  ./install.sh --include-skill my-*     # include only matching skills

Category aliases:
  ext, extension, extensions
  skill, skills
  theme, themes
  agent, agents

Per-category filters (comma-separated glob patterns):
  --include-ext PATTERNS    whitelist extensions
  --exclude-ext PATTERNS    blacklist extensions
  --include-skill PATTERNS  whitelist skills
  --exclude-skill PATTERNS  blacklist skills
  --include-theme PATTERNS  whitelist themes
  --exclude-theme PATTERNS  blacklist themes
  --include-agent PATTERNS  whitelist agents
  --exclude-agent PATTERNS  blacklist agents
EOF
}

normalize_category() {
    case "$1" in
        ext|extension|extensions) echo "extensions" ;;
        skill|skills) echo "skills" ;;
        theme|themes) echo "themes" ;;
        agent|agents) echo "agents" ;;
        *) echo "$1" ;;
    esac
}

should_sync_category() {
    local cat="$(normalize_category "$1")"

    if [[ -n "$ONLY_CATEGORIES" ]]; then
        local found=0
        IFS=',' read -ra parts <<< "$ONLY_CATEGORIES"
        for p in "${parts[@]}"; do
            [[ "$(normalize_category "$p")" == "$cat" ]] && { found=1; break; }
        done
        [[ $found -eq 0 ]] && return 1
    fi

    if [[ -n "$SKIP_CATEGORIES" ]]; then
        IFS=',' read -ra parts <<< "$SKIP_CATEGORIES"
        for p in "${parts[@]}"; do
            [[ "$(normalize_category "$p")" == "$cat" ]] && return 1
        done
    fi

    return 0
}

matches_pattern() {
    local name="$1"
    local patterns="$2"
    [[ -z "$patterns" ]] && return 1
    IFS=',' read -ra ps <<< "$patterns"
    for p in "${ps[@]}"; do
        p="$(echo "$p" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
        [[ -z "$p" ]] && continue
        case "$name" in
            $p) return 0 ;;
        esac
    done
    return 1
}

should_sync_item() {
    local name="$1"
    local include="$2"
    local exclude="$3"

    if [[ -n "$include" ]]; then
        matches_pattern "$name" "$include" || return 1
    fi

    if [[ -n "$exclude" ]]; then
        matches_pattern "$name" "$exclude" && return 1
    fi

    return 0
}
