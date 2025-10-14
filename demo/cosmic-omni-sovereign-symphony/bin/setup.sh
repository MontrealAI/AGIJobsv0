#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  export $(grep -v '^#' .env | xargs -0 2>/dev/null || true)
fi

echo "[setup] Installing dependencies via pnpm"
pnpm install --frozen-lockfile

echo "[setup] Checking Hardhat version"
pnpm hardhat --version

echo "[setup] Checking Foundry"
if command -v forge >/dev/null 2>&1; then
  forge --version
else
  echo "[setup] Foundry (forge) not detected; install via https://book.getfoundry.sh" >&2
fi

