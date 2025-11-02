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
export npm_config_fund=false
export npm_config_audit=false

# npx may set a transient prefix that points outside the workspace and causes
# `npm ci` to look for the lockfile in the wrong directory. Strip any inherited
# overrides so installs always target the resolved working directory, then pin
# the local prefix to the workspace to keep npm focused on the intended
# manifest set even if callers exported custom values.
unset npm_config_prefix
unset NPM_CONFIG_PREFIX
export npm_config_local_prefix="$WORKDIR"
export NPM_CONFIG_LOCAL_PREFIX="$WORKDIR"

echo "[npm-ci] node $(node -v)" >&2
echo "[npm-ci] npm ${CURRENT_NPM_VERSION}" >&2
echo "[npm-ci] installing in $WORKDIR" >&2
echo "[npm-ci] lockfile: $LOCKFILE_PATH" >&2

pushd "$WORKDIR" >/dev/null
"${NPM_COMMAND[@]}" ci "${FILTERED_ARGS[@]}"
popd >/dev/null
