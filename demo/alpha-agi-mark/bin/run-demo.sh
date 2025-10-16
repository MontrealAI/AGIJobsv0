#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}" || exit 1

export AGIJOBS_DEMO_DRY_RUN="${AGIJOBS_DEMO_DRY_RUN:-1}"

printf '\n🚀 Launching α-AGI MARK sovereign foresight demo (dry-run=%s)\n\n' "$AGIJOBS_DEMO_DRY_RUN"

npx hardhat run --config demo/alpha-agi-mark/hardhat.config.ts demo/alpha-agi-mark/scripts/run-demo.ts
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/../.. && pwd)"
PROJECT_DIR="$ROOT_DIR/demo/alpha-agi-mark"

export HARDHAT_NETWORK="hardhat"

pushd "$ROOT_DIR" >/dev/null
npx hardhat run --config "$PROJECT_DIR/hardhat.config.ts" "$PROJECT_DIR/scripts/runDemo.ts"
popd >/dev/null
