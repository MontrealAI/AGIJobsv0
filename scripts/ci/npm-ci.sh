#!/usr/bin/env bash
set -euo pipefail

export CYPRESS_INSTALL_BINARY="${CYPRESS_INSTALL_BINARY:-0}"
export npm_config_fund=false
export npm_config_audit=false

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${NPM_CI_ROOT:-$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || (cd "$SCRIPT_DIR/../.." && pwd))}"
WORK_DIR="${NPM_CI_WORKDIR:-$ROOT_DIR}"
LOCKFILE="${NPM_CI_LOCKFILE:-package-lock.json}"

if [[ ! -f "$WORK_DIR/$LOCKFILE" ]]; then
  cat <<EOF >&2
Error: expected lockfile "$LOCKFILE" in "$WORK_DIR" before running npm ci.
Set NPM_CI_WORKDIR or NPM_CI_LOCKFILE if your lockfile lives elsewhere.
EOF
  exit 1
fi

cd "$WORK_DIR"

npm ci "$@"
