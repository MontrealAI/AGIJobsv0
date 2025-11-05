#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${NPM_CI_PROJECT_ROOT:-${GITHUB_WORKSPACE:-$PWD}}"

if command -v git >/dev/null 2>&1; then
  GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
else
  GIT_ROOT=""
fi

# Normalise the lockfile path, preferring explicit overrides, then ROOT, then git root.
if [ -n "${NPM_CI_LOCK_PATH+x}" ]; then
  case "$NPM_CI_LOCK_PATH" in
    /*)
      LOCK="$NPM_CI_LOCK_PATH"
      ;;
    *)
      if [ -f "$ROOT/$NPM_CI_LOCK_PATH" ]; then
        LOCK="$ROOT/$NPM_CI_LOCK_PATH"
      elif [ -n "$GIT_ROOT" ] && [ -f "$GIT_ROOT/$NPM_CI_LOCK_PATH" ]; then
        LOCK="$GIT_ROOT/$NPM_CI_LOCK_PATH"
      else
        LOCK="$NPM_CI_LOCK_PATH"
      fi
      ;;
  esac
else
  LOCK="$ROOT/package-lock.json"
fi

if [ ! -f "$LOCK" ] && [ -n "$GIT_ROOT" ]; then
  if [ -f "$GIT_ROOT/package-lock.json" ]; then
    ROOT="$GIT_ROOT"
    LOCK="$ROOT/package-lock.json"
  fi
fi

if [ ! -f "$LOCK" ] && [ -n "${GITHUB_WORKSPACE:-}" ]; then
  if [ -f "$GITHUB_WORKSPACE/package-lock.json" ]; then
    ROOT="$GITHUB_WORKSPACE"
    LOCK="$ROOT/package-lock.json"
  fi
fi

if [ ! -f "$LOCK" ]; then
  if command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if [[ "$LOCK" == "$ROOT/"* ]]; then
      RELATIVE_PATH="${LOCK#$ROOT/}"
    else
      RELATIVE_PATH="$LOCK"
    fi

    if git -C "$ROOT" ls-files --error-unmatch "$RELATIVE_PATH" >/dev/null 2>&1; then
      git -C "$ROOT" checkout -- "$RELATIVE_PATH" >/dev/null 2>&1 || true

      if [ ! -f "$LOCK" ]; then
        git config --global --add safe.directory "$ROOT" >/dev/null 2>&1 || true
        if git -C "$ROOT" rev-parse HEAD >/dev/null 2>&1; then
          mkdir -p "$(dirname "$LOCK")"
          git -C "$ROOT" show "HEAD:$RELATIVE_PATH" >"$LOCK" 2>/dev/null || true
        fi
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
