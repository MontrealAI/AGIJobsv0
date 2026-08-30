#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/../../.. && pwd)"
cd "$ROOT_DIR"

if [[ ! -f package.json ]]; then
  echo "[Celestial Imperium] Error: package.json not found. Run this script from within the repository clone." >&2
  exit 1
fi

echo "🌌 Celestial Imperium Exhibition — initiating Astral Omnidominion First-Class demo"

echo "🔍 Running repository healthcheck (optional)..."
if ! git status --short >/dev/null 2>&1; then
  echo "⚠️  Git not detected; continuing without cleanliness check." >&2
else
  if [[ -n "$(git status --short)" ]]; then
    echo "⚠️  Working tree has uncommitted changes. Artefacts will reflect the current state." >&2
  else
    echo "✅ Working tree clean."
  fi
fi

echo "🚀 Launching demo:agi-os:first-class"
NODE_OPTIONS="${NODE_OPTIONS:-}" npm run demo:agi-os:first-class "$@"
