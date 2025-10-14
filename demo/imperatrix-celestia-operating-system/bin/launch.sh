#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules && "${IMPERATRIX_SKIP_INSTALL:-0}" != "1" ]]; then
  echo "ℹ️  Installing workspace dependencies (first run)." >&2
  npm install
fi

ARGS=("$@")
if (( ${#ARGS[@]} == 0 )); then
  ARGS=(--yes --network localhost --compose)
fi

if [[ ${ARGS[0]:-} == "interactive" ]]; then
  ARGS=("${ARGS[@]:1}")
fi

echo "🚀 Launching AGI Jobs v0 (v2) first-class operating system demonstration..." >&2
if (( ${#ARGS[@]} == 0 )); then
  npm run demo:agi-os:first-class
else
  npm run demo:agi-os:first-class -- "${ARGS[@]}"
fi
