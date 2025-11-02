#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${NPM_CI_PROJECT_ROOT:-$PWD}"
LOCK="${NPM_CI_LOCK_PATH:-$ROOT/package-lock.json}"
REPO_ROOT=$(git -C "$ROOT" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$ROOT")

if [ ! -f "$REPO_ROOT/package.json" ]; then
  echo "::error ::Unable to locate package.json at repository root ($REPO_ROOT)" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "::error ::jq is required to validate npm lockfiles" >&2
  exit 1
fi

EXPECTED_PM=$(jq -r '.packageManager // empty' "$REPO_ROOT/package.json")
if [ -n "$EXPECTED_PM" ]; then
  EXPECTED_NPM=${EXPECTED_PM#npm@}
  CURRENT_NPM=$(npm --version 2>/dev/null || printf 'unknown')
  if [ "$CURRENT_NPM" = "unknown" ]; then
    echo "::error ::Unable to determine npm version" >&2
    exit 1
  fi
  case "$CURRENT_NPM" in
    ${EXPECTED_NPM%.*}*) ;; # allow patch drift within same minor
    *)
      echo "::error ::npm version mismatch. Expected ${EXPECTED_NPM} (from package.json) but found ${CURRENT_NPM}" >&2
      exit 1
      ;;
  esac
fi

NVMRC_PATH="$REPO_ROOT/.nvmrc"
if [ -f "$NVMRC_PATH" ]; then
  EXPECTED_NODE=$(tr -d '\r' <"$NVMRC_PATH")
  CURRENT_NODE=$(node --version 2>/dev/null | sed 's/^v//')
  if [ -z "$CURRENT_NODE" ]; then
    echo "::error ::Unable to determine Node.js version" >&2
    exit 1
  fi
  case "$EXPECTED_NODE" in
    *.*.*)
      if [ "$CURRENT_NODE" != "$EXPECTED_NODE" ]; then
        echo "::error ::Node.js version mismatch. Expected $EXPECTED_NODE (from .nvmrc) but found $CURRENT_NODE" >&2
        exit 1
      fi
      ;;
    *.*)
      if [ "${CURRENT_NODE%.*}" != "$EXPECTED_NODE" ]; then
        echo "::error ::Node.js version mismatch. Expected series $EXPECTED_NODE.x but found $CURRENT_NODE" >&2
        exit 1
      fi
      ;;
  esac
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

npm ci --no-audit --prefer-offline --progress=false "$@"
