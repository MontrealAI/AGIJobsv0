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

REQUIRED_NPM_VERSION="${NPM_CI_NPM_VERSION:-11.4.2}"
USE_NPX_FALLBACK=false

ensure_desired_npm() {
  local current_version

  if [ "${NPM_CI_FORCE_NPX:-0}" = "1" ]; then
    USE_NPX_FALLBACK=true
    return 1
  fi

  current_version="$(npm -v 2>/dev/null || true)"

  if [ "$current_version" = "$REQUIRED_NPM_VERSION" ]; then
    return 0
  fi

  if command -v corepack >/dev/null 2>&1; then
    if corepack enable >/dev/null 2>&1 && \
       corepack prepare "npm@${REQUIRED_NPM_VERSION}" --activate >/dev/null 2>&1; then
      current_version="$(npm -v 2>/dev/null || true)"
      if [ "$current_version" = "$REQUIRED_NPM_VERSION" ]; then
        return 0
      fi
    else
      echo "[npm-ci] WARNING: corepack failed to activate npm@${REQUIRED_NPM_VERSION}; attempting alternate upgrade path" >&2
    fi
  fi

  if command -v npm >/dev/null 2>&1; then
    if npm install --location=global "npm@${REQUIRED_NPM_VERSION}" >/dev/null 2>&1; then
      hash -r 2>/dev/null || true
      current_version="$(npm -v 2>/dev/null || true)"
      if [ "$current_version" = "$REQUIRED_NPM_VERSION" ]; then
        return 0
      fi
    else
      echo "[npm-ci] WARNING: npm install --location=global npm@${REQUIRED_NPM_VERSION} failed; falling back to npx" >&2
    fi
  fi

  USE_NPX_FALLBACK=true
  return 1
}

ensure_desired_npm || true

export CYPRESS_INSTALL_BINARY="${CYPRESS_INSTALL_BINARY:-0}"
export npm_config_package_lock=true
export npm_config_fund=false
export npm_config_audit=false

CURRENT_NPM_VERSION="$(npm -v 2>/dev/null || true)"

echo "[npm-ci] node $(node -v)" >&2
if [ "$USE_NPX_FALLBACK" = true ]; then
  echo "[npm-ci] npm (via npx) $REQUIRED_NPM_VERSION" >&2
else
  echo "[npm-ci] npm ${CURRENT_NPM_VERSION:-unknown}" >&2
fi
echo "[npm-ci] installing in $WORKDIR" >&2
echo "[npm-ci] lockfile: $LOCKFILE_PATH" >&2

run_install() {
  if [ "$USE_NPX_FALLBACK" = true ]; then
    npx --yes "npm@${REQUIRED_NPM_VERSION}" ci "${FILTERED_ARGS[@]}"
  else
    npm ci "${FILTERED_ARGS[@]}"
  fi
}

pushd "$WORKDIR" >/dev/null
run_install
popd >/dev/null
