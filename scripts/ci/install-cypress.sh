#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

# Allow overriding via CYPRESS_VERSION pin
if [[ -n "${CYPRESS_VERSION:-}" ]]; then
  VERSION="$CYPRESS_VERSION"
else
  VERSION=$(node -pe "const pkg=require('./package.json'); (pkg.devDependencies&&pkg.devDependencies.cypress)||(pkg.dependencies&&pkg.dependencies.cypress)||''")
  VERSION="${VERSION//^/}"
  VERSION="${VERSION//~/}"
fi

if [[ -z "$VERSION" ]]; then
  echo "Unable to determine Cypress version from package.json" >&2
  exit 1
fi

CACHE_DIR="${CYPRESS_CACHE_FOLDER:-$HOME/.cache/Cypress}"
mkdir -p "$CACHE_DIR"

case "${CYPRESS_PLATFORM:-}" in
  linux-*|darwin-*|win32-*)
    PLATFORM="${CYPRESS_PLATFORM}"
    ;;
  "")
    uname_out="$(uname -s)"
    arch_out="$(uname -m)"
    case "$arch_out" in
      x86_64|amd64)
        arch_norm="x64" ;;
      aarch64|arm64)
        arch_norm="arm64" ;;
      *)
        arch_norm="$arch_out" ;;
    esac
    case "$uname_out" in
      Linux)
        PLATFORM="linux-${arch_norm}" ;;
      Darwin)
        PLATFORM="darwin-${arch_norm}" ;;
      MINGW*|MSYS*|CYGWIN*)
        PLATFORM="win32-${arch_norm}" ;;
      *)
        PLATFORM="linux-${arch_norm}" ;;
    esac
    ;;
  *)
    PLATFORM="${CYPRESS_PLATFORM}"
    ;;
esac

attempt_install() {
  echo "Attempting Cypress install via npm CLI" >&2
  CYPRESS_CACHE_FOLDER="$CACHE_DIR" npx cypress install --force
}

verify_install() {
  if CYPRESS_CACHE_FOLDER="$CACHE_DIR" npx cypress version >/dev/null 2>&1; then
    return 0
  fi

  if [[ -d "$CACHE_DIR/${VERSION}/Cypress" ]]; then
    echo "Cypress verify fallback: binary present at $CACHE_DIR/${VERSION}/Cypress" >&2
    return 0
  fi

  if [[ -d "$CACHE_DIR/${VERSION}/${PLATFORM}" ]]; then
    echo "Cypress verify fallback: binary present at $CACHE_DIR/${VERSION}/${PLATFORM}" >&2
    return 0
  fi

  return 1
}

max_attempts=${CYPRESS_INSTALL_ATTEMPTS:-3}
for attempt in $(seq 1 "$max_attempts"); do
  if attempt_install; then
    if verify_install; then
      exit 0
    fi
  fi
  echo "Cypress install attempt $attempt of $max_attempts failed" >&2
  sleep $((attempt * 5))
done

echo "Falling back to direct download from CDN" >&2
ZIP_NAME="cypress.zip"
DOWNLOAD_URL="https://cdn.cypress.io/desktop/${VERSION}/${PLATFORM}/cypress.zip"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

curl -fL --retry 5 --retry-delay 5 "$DOWNLOAD_URL" -o "$TMP_DIR/$ZIP_NAME"
unzip -q "$TMP_DIR/$ZIP_NAME" -d "$TMP_DIR"
mkdir -p "$CACHE_DIR/${VERSION}"
rm -rf "$CACHE_DIR/${VERSION}/Cypress"
mv "$TMP_DIR/Cypress" "$CACHE_DIR/${VERSION}/Cypress"

verify_install
