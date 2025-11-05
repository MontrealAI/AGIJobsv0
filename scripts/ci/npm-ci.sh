#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${NPM_CI_PROJECT_ROOT:-$PWD}"
LOCK="${NPM_CI_LOCK_PATH:-$ROOT/package-lock.json}"

if [ ! -f "$LOCK" ]; then
  echo "::error ::package-lock.json missing at $LOCK" >&2
  exit 1
fi

if ! node -e 'const fs = require("fs"); JSON.parse(fs.readFileSync(process.argv[1], "utf8"));' "$LOCK"; then
  echo "::error ::package-lock.json invalid JSON at $LOCK" >&2
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
