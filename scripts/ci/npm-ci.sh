#!/usr/bin/env bash
set -euo pipefail

# Resolve repository root and allow callers to override the working directory.
SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
WORKDIR="${NPM_CI_PROJECT_ROOT:-$REPO_ROOT}"

PREFIX_ARG=""
FILTERED_ARGS=()
while (($#)); do
  case "$1" in
    --prefix)
      shift
      PREFIX_ARG="$1"
      ;;
    --prefix=*)
      PREFIX_ARG="${1#*=}"
      ;;
    -C)
      shift
      PREFIX_ARG="$1"
      ;;
    *)
      FILTERED_ARGS+=("$1")
      ;;
  esac
  shift || true
done

if [ -n "$PREFIX_ARG" ]; then
  if [[ "$PREFIX_ARG" = /* ]]; then
    WORKDIR="$PREFIX_ARG"
  else
    WORKDIR="${WORKDIR}/${PREFIX_ARG}"
  fi
fi

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

REQUIRED_NODE_VERSION="${NPM_CI_MIN_NODE_VERSION:-20.19.0}"
CURRENT_NODE_VERSION="$(node -v)"

if ! node "$SCRIPT_DIR/version-check.mjs" "$CURRENT_NODE_VERSION" "$REQUIRED_NODE_VERSION"; then
  echo "[npm-ci] WARNING: Node $CURRENT_NODE_VERSION is older than required $REQUIRED_NODE_VERSION" >&2
  echo "[npm-ci] Upgrade your Node runtime (nvm install $REQUIRED_NODE_VERSION) to avoid engine conflicts" >&2
fi

COREPACK_NPM_VERSION="${NPM_CI_NPM_VERSION:-11.4.2}"
CURRENT_NPM_VERSION="$(npm -v 2>/dev/null || true)"

if command -v corepack >/dev/null 2>&1; then
  if [ "$CURRENT_NPM_VERSION" != "$COREPACK_NPM_VERSION" ]; then
    if ! corepack enable >/dev/null 2>&1; then
      echo "[npm-ci] WARNING: Failed to enable corepack; continuing with npm $CURRENT_NPM_VERSION" >&2
    else
      if corepack prepare "npm@${COREPACK_NPM_VERSION}" --activate >/dev/null 2>&1; then
        CURRENT_NPM_VERSION="$(npm -v 2>/dev/null || true)"
      else
        echo "[npm-ci] WARNING: corepack prepare npm@${COREPACK_NPM_VERSION} failed; continuing with npm $CURRENT_NPM_VERSION" >&2
      fi
    fi
  fi
fi

NPM_COMMAND=(npm)

if [ "$CURRENT_NPM_VERSION" != "$COREPACK_NPM_VERSION" ]; then
  if command -v npx >/dev/null 2>&1; then
    echo "[npm-ci] activating npm@${COREPACK_NPM_VERSION} via npx fallback" >&2
    NPM_COMMAND=(npx --yes "npm@${COREPACK_NPM_VERSION}")
    CURRENT_NPM_VERSION="$("${NPM_COMMAND[@]}" -v 2>/dev/null || true)"
  else
    echo "[npm-ci] WARNING: Unable to locate npx for npm@${COREPACK_NPM_VERSION}; continuing with npm ${CURRENT_NPM_VERSION:-unknown}" >&2
  fi
fi

if [ -z "$CURRENT_NPM_VERSION" ]; then
  CURRENT_NPM_VERSION="unknown"
fi

export CYPRESS_INSTALL_BINARY="${CYPRESS_INSTALL_BINARY:-0}"
export npm_config_package_lock=true
export NPM_CONFIG_PACKAGE_LOCK=true
export npm_config_fund=false
export npm_config_audit=false

# Guarantee npm sees package-lock support even if upstream tooling injected a
# conflicting user config. We stage a throwaway npmrc that explicitly enables
# package-lock usage and point both lower/upper-case env vars at it so the
# setting takes precedence over inherited values.
TEMP_NPMRC="$(mktemp)"
trap 'rm -f "${TEMP_NPMRC}"' EXIT
if [ -n "${NPM_CONFIG_USERCONFIG:-}" ] && [ -f "${NPM_CONFIG_USERCONFIG}" ]; then
  cat "${NPM_CONFIG_USERCONFIG}" >"${TEMP_NPMRC}"
fi
printf '\npackage-lock=true\n' >>"${TEMP_NPMRC}"
export npm_config_userconfig="${TEMP_NPMRC}"
export NPM_CONFIG_USERCONFIG="${TEMP_NPMRC}"

# npx may set a transient prefix that points outside the workspace and causes
# `npm ci` to look for the lockfile in the wrong directory. Strip any inherited
# overrides so installs always target the resolved working directory.
unset npm_config_prefix
unset NPM_CONFIG_PREFIX

echo "[npm-ci] node $(node -v)" >&2
echo "[npm-ci] npm ${CURRENT_NPM_VERSION}" >&2
echo "[npm-ci] installing in $WORKDIR" >&2
echo "[npm-ci] lockfile: $LOCKFILE_PATH" >&2

# Ensure any pre-existing installation is removed before delegating to npm so
# stale artifacts (for example read-only build outputs) never cause `npm ci`
# to abort while pruning the tree.
if [ -d "$WORKDIR/node_modules" ]; then
  echo "[npm-ci] removing existing node_modules" >&2
  chmod -R u+w "$WORKDIR/node_modules" 2>/dev/null || true
  rm -rf "$WORKDIR/node_modules"
  if [ -d "$WORKDIR/node_modules" ]; then
    python3 - "$WORKDIR/node_modules" <<'PY' 2>/dev/null || true
import shutil, sys
from pathlib import Path
target = Path(sys.argv[1])
if target.exists():
    shutil.rmtree(target)
PY
  fi
fi

pushd "$WORKDIR" >/dev/null
# Inspect the effective package-lock setting so CI logs surface any inherited
# overrides that would otherwise cause npm to abort with EUSAGE.
LOCK_SETTING="unknown"
set +e
if OUTPUT="$(${NPM_COMMAND[@]} config get package-lock 2>/dev/null)"; then
  LOCK_SETTING="$OUTPUT"
fi
set -e
echo "[npm-ci] npm config package-lock=${LOCK_SETTING}" >&2

"${NPM_COMMAND[@]}" ci "${FILTERED_ARGS[@]}"
popd >/dev/null
