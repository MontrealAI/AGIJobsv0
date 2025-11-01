#!/usr/bin/env bash
set -euo pipefail

export CYPRESS_INSTALL_BINARY="${CYPRESS_INSTALL_BINARY:-0}"
export npm_config_fund=false
export npm_config_audit=false

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if repo_root="$(git -C "$script_dir" rev-parse --show-toplevel 2>/dev/null)"; then
  :
else
  repo_root="$(cd "$script_dir/../.." && pwd)"
fi

workdir="${NPM_CI_WORKDIR:-$repo_root}"

if [ ! -d "$workdir" ]; then
  echo "Requested npm ci workdir '$workdir' does not exist" >&2
  exit 1
fi

lock_path="${NPM_CI_LOCK_PATH:-package-lock.json}"

if [ ! -f "$workdir/$lock_path" ]; then
  echo "${lock_path} not found in $workdir" >&2
  exit 1
fi

pushd "$workdir" >/dev/null
npm ci "$@"
popd >/dev/null
