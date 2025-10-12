#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

NETWORK_NAME="${NETWORK:-localhost}"
REPORT_DIR="reports/${NETWORK_NAME}/aurora"
DEPLOY_LOG="${REPORT_DIR}/deploy.log"
mkdir -p "$REPORT_DIR"

if ! command -v anvil >/dev/null 2>&1; then
  echo "anvil binary is required to run the AURORA demo" >&2
  exit 1
fi

pkill -f "anvil" >/dev/null 2>&1 || true
anvil --silent --block-time 1 > /tmp/anvil.log 2>&1 &
ANVIL_PID=$!
trap 'kill $ANVIL_PID >/dev/null 2>&1 || true' EXIT

for _ in {1..60}; do
  if nc -z 127.0.0.1 8545 >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! nc -z 127.0.0.1 8545 >/dev/null 2>&1; then
  echo "anvil failed to start on 8545" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEPLOY_LOG")"

echo "🚀 Deploying protocol defaults"
set -o pipefail
npx hardhat run --network "$NETWORK_NAME" scripts/v2/deployDefaults.ts | tee "$DEPLOY_LOG"
set +o pipefail

export AURORA_DEPLOY_LOG="$DEPLOY_LOG"

npx ts-node --transpile-only demo/aurora/aurora.demo.ts --network "$NETWORK_NAME"

npx ts-node --transpile-only demo/aurora/bin/aurora-report.ts --network "$NETWORK_NAME"
