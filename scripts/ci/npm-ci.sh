#!/usr/bin/env bash
set -euo pipefail

# Resolve repository root and allow callers to override the working directory.
SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
BASE_WORKDIR="${NPM_CI_PROJECT_ROOT:-$REPO_ROOT}"

# Normalise incoming arguments so callers can continue using `--prefix` when
# targeting nested packages. npm itself does not honour `--prefix` for `npm ci`,
# so we emulate it by shifting our working directory before invoking npm.
PREFIX=""
FORWARDED_ARGS=()
while (( "$#" )); do
  case "$1" in
    --prefix=*)
      PREFIX="${1#*=}"
      shift
      ;;
    --prefix)
      if [ $# -lt 2 ]; then
        echo "--prefix requires a value" >&2
        exit 1
      fi
      PREFIX="$2"
      shift 2
      ;;
    -C)
      if [ $# -lt 2 ]; then
        echo "-C requires a value" >&2
        exit 1
      fi
      PREFIX="$2"
      shift 2
      ;;
    -C*)
      PREFIX="${1#-C}"
      shift
      ;;
    *)
      FORWARDED_ARGS+=("$1")
      shift
      ;;
  esac
done

WORKDIR="$BASE_WORKDIR"
if [ -n "$PREFIX" ]; then
  if [ "${PREFIX#/}" != "$PREFIX" ]; then
    WORKDIR="$PREFIX"
  else
    WORKDIR="$BASE_WORKDIR/$PREFIX"
  fi
fi

if [ ! -d "$WORKDIR" ]; then
  echo "npm-ci: resolved workdir $WORKDIR does not exist" >&2
  exit 1
fi

WORKDIR="$(cd -- "$WORKDIR" && pwd)"

LOCKFILE_PATH="${NPM_CI_LOCK_PATH:-${WORKDIR}/package-lock.json}"
PACKAGE_JSON_PATH="${NPM_CI_PACKAGE_JSON_PATH:-${WORKDIR}/package.json}"

if [ ! -f "$PACKAGE_JSON_PATH" ]; then
  echo "package.json not found at $PACKAGE_JSON_PATH" >&2
  echo "Current directory: $(pwd)" >&2
  echo "WORKDIR resolved to: $WORKDIR" >&2
  exit 1
fi

if [ ! -f "$LOCKFILE_PATH" ]; then
  echo "package-lock.json not found at $LOCKFILE_PATH" >&2
  echo "Current directory: $(pwd)" >&2
  echo "WORKDIR resolved to: $WORKDIR" >&2
  exit 1
fi

export CYPRESS_INSTALL_BINARY="${CYPRESS_INSTALL_BINARY:-0}"
export npm_config_package_lock="${npm_config_package_lock:-true}"
export npm_config_fund=false
export npm_config_audit=false

pushd "$WORKDIR" >/dev/null
npm ci "${FORWARDED_ARGS[@]}"
popd >/dev/null
