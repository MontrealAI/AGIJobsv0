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

if [ "$CURRENT_NPM_VERSION" != "$COREPACK_NPM_VERSION" ]; then
  echo "[npm-ci] INFO: Installing npm@${COREPACK_NPM_VERSION} globally (current $CURRENT_NPM_VERSION)" >&2
  if npm install -g "npm@${COREPACK_NPM_VERSION}" >/dev/null 2>&1; then
    hash -r 2>/dev/null || true
    CURRENT_NPM_VERSION="$(npm -v 2>/dev/null || true)"
  else
    echo "[npm-ci] WARNING: Failed to install npm@${COREPACK_NPM_VERSION} globally; continuing with npm $CURRENT_NPM_VERSION" >&2
  fi
fi

if ! node -e 'const fs=require("fs");const path=process.argv[1];let raw="";try{raw=fs.readFileSync(path,"utf8");}catch(err){console.error(err.message);process.exit(1);}if(!raw.trim()){console.error("lockfile empty");process.exit(2);}let parsed;try{parsed=JSON.parse(raw);}catch(err){console.error(err.message);process.exit(3);}if(typeof parsed.lockfileVersion!=="number"||parsed.lockfileVersion<1){console.error("invalid lockfileVersion");process.exit(4);}' "$LOCKFILE_PATH" >/dev/null 2>&1; then
  echo "[npm-ci] ERROR: package-lock.json at $LOCKFILE_PATH failed validation" >&2
  echo "[npm-ci] Ensure the file exists, is populated, and generated with npm@$COREPACK_NPM_VERSION" >&2
  exit 1
fi

export CYPRESS_INSTALL_BINARY="${CYPRESS_INSTALL_BINARY:-0}"
export npm_config_package_lock=true
export npm_config_fund=false
export npm_config_audit=false

echo "[npm-ci] node $(node -v)" >&2
echo "[npm-ci] npm $(npm -v)" >&2
echo "[npm-ci] installing in $WORKDIR" >&2
if command -v stat >/dev/null 2>&1; then
  LOCK_STAT="$(stat -c '%s bytes' "$LOCKFILE_PATH" 2>/dev/null || echo size unknown)"
else
  LOCK_STAT="size unknown"
fi
echo "[npm-ci] lockfile: $LOCKFILE_PATH ($LOCK_STAT)" >&2

pushd "$WORKDIR" >/dev/null
npm ci "${FILTERED_ARGS[@]}"
popd >/dev/null
