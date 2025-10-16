#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/../.. && pwd)"
PROJECT_DIR="$ROOT_DIR/demo/alpha-agi-mark"

NETWORK_NAME="${ALPHA_MARK_NETWORK:-hardhat}"

export HARDHAT_NETWORK="$NETWORK_NAME"

CMD=(npx hardhat run --config "$PROJECT_DIR/hardhat.config.ts")
if [[ "$NETWORK_NAME" != "hardhat" ]]; then
  CMD+=(--network "$NETWORK_NAME")
fi
CMD+=("$PROJECT_DIR/scripts/runDemo.ts")

pushd "$ROOT_DIR" >/dev/null
"${CMD[@]}"
popd >/dev/null
