#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/../.. && pwd)"
PROJECT_DIR="$ROOT_DIR/demo/alpha-agi-mark"

export HARDHAT_NETWORK="hardhat"

pushd "$ROOT_DIR" >/dev/null
npx hardhat run --config "$PROJECT_DIR/hardhat.config.ts" "$PROJECT_DIR/scripts/runDemo.ts"
popd >/dev/null
