#!/usr/bin/env bash
set -euo pipefail

export CYPRESS_INSTALL_BINARY="${CYPRESS_INSTALL_BINARY:-0}"
export npm_config_fund=false
export npm_config_audit=false

should_auto_cd=true

# If the caller explicitly set a target directory via --prefix or --workspace,
# defer to npm for lockfile discovery in that location.
for arg in "$@"; do
  case "$arg" in
    --prefix*|--workspace*|-w)
      should_auto_cd=false
      break
      ;;
  esac
done

if "$should_auto_cd"; then
  search_dir="$PWD"
  while [[ "$search_dir" != "/" ]]; do
    if [[ -f "$search_dir/package-lock.json" || -f "$search_dir/npm-shrinkwrap.json" ]]; then
      if [[ "$search_dir" != "$PWD" ]]; then
        pushd "$search_dir" >/dev/null
        trap 'popd >/dev/null' EXIT
      fi
      break
    fi
    search_dir="$(dirname "$search_dir")"
  done
fi

if [[ ! -f package-lock.json && ! -f npm-shrinkwrap.json ]]; then
  cat >&2 <<'EOF'
Error: npm ci requires package-lock.json (or npm-shrinkwrap.json) but none was found.
Ensure the workflow runs from a directory that contains the lockfile or pass
--prefix/--workspace to target a directory with its own lockfile.
EOF
  exit 1
fi

npm ci "$@"
