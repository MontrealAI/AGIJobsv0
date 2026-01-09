#!/usr/bin/env bash
set -euo pipefail

matches=$(rg -n --pcre2 ":\s*0x[0-9a-fA-F]{16,}\\b" .github/workflows || true)

if [[ -n "$matches" ]]; then
  echo "Error: Unquoted 0x hex literal(s) detected in workflow YAML. Quote the value as a string (e.g., '0x...')." >&2
  echo "$matches" >&2
  exit 1
fi
