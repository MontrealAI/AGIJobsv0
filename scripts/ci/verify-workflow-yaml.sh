#!/usr/bin/env bash
set -euo pipefail

matches=$(rg -n --pcre2 ":[ \t]*(?!['\"])0x[0-9a-fA-F]{16,}\\b" .github/workflows/*.yml || true)

if [[ -n "$matches" ]]; then
  echo "ERROR: Unquoted 0x literals found in workflow YAML. Quote them as strings:"
  echo "$matches"
  exit 1
fi
