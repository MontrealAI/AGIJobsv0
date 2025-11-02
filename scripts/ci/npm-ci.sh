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

if [ "${CI:-false}" != "false" ]; then
  if [ "${AGIJOBS_CYPRESS_INSTALL:-0}" != "0" ]; then
    export CYPRESS_INSTALL_BINARY="${CYPRESS_INSTALL_BINARY:-1}"
    unset npm_config_cypress_skip_binary_install || true
  else
    export CYPRESS_INSTALL_BINARY="${CYPRESS_INSTALL_BINARY:-0}"
    export npm_config_cypress_skip_binary_install="${npm_config_cypress_skip_binary_install:-1}"
  fi
fi

npm ci --no-audit --prefer-offline --progress=false "$@"
