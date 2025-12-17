#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${NPM_CI_PROJECT_ROOT:-$PWD}"
LOCK="${NPM_CI_LOCK_PATH:-$ROOT/package-lock.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "::error ::jq is required to validate npm lockfiles" >&2
  exit 1
fi

if ! jq -e . "$LOCK" >/dev/null 2>&1; then
  echo "::error ::package-lock.json missing or invalid at $LOCK" >&2
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

# Cypress attempts to download a heavyweight binary during installation, which
# can fail in hermetic CI environments without internet access. Default to
# skipping the binary fetch unless the caller explicitly opts in by setting
# CYPRESS_INSTALL_BINARY.
export CYPRESS_INSTALL_BINARY="${CYPRESS_INSTALL_BINARY:-0}"

npm ci --no-audit --prefer-offline --progress=false "$@"
