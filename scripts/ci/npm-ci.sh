#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${NPM_CI_PROJECT_ROOT:-$PWD}"
LOCK="${NPM_CI_LOCK_PATH:-$ROOT/package-lock.json}"

if [ ! -f "$LOCK" ]; then
  if [ -z "${NPM_CI_LOCK_PATH+x}" ] && [ -z "${NPM_CI_PROJECT_ROOT+x}" ]; then
    if command -v git >/dev/null 2>&1; then
      GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
      if [ -n "$GIT_ROOT" ] && [ -f "$GIT_ROOT/package-lock.json" ]; then
        ROOT="$GIT_ROOT"
        LOCK="$ROOT/package-lock.json"
      fi
    fi
  fi
fi

if [ ! -f "$LOCK" ]; then
  echo "::error ::package-lock.json missing or invalid at $LOCK" >&2
  exit 1
fi

if command -v node >/dev/null 2>&1; then
  if ! node - <<'NODE' "$LOCK"
const fs = require('node:fs');
const path = process.argv[2];

try {
  JSON.parse(fs.readFileSync(path, 'utf8'));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
NODE
  then
    echo "::error ::package-lock.json missing or invalid at $LOCK" >&2
    exit 1
  fi
elif command -v jq >/dev/null 2>&1; then
  if ! jq -e . "$LOCK" >/dev/null 2>&1; then
    echo "::error ::package-lock.json missing or invalid at $LOCK" >&2
    exit 1
  fi
else
  echo "::error ::Unable to validate $LOCK: install Node.js or jq" >&2
  exit 1
fi

if [ -d "$ROOT/node_modules" ]; then
  if ! rm -rf "$ROOT/node_modules" 2>/dev/null; then
    python3 - <<'PY'
import os
import shutil
root = os.environ.get("NPM_CI_PROJECT_ROOT", os.getcwd())
shutil.rmtree(os.path.join(root, "node_modules"), ignore_errors=True)
PY
  fi
fi

# Skip Cypress binary downloads in sandboxed CI environments unless explicitly enabled.
export CYPRESS_INSTALL_BINARY="${CYPRESS_INSTALL_BINARY:-0}"

npm ci --no-audit --prefer-offline --progress=false "$@"
