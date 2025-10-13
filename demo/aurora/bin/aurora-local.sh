#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

export RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
export PRIVATE_KEY="${PRIVATE_KEY:-0x59c6995e998f97a5a004497e5d6a897bcf7a20a0aa2a0b3f1d0ad6bdfb9c0001}"
export WORKER_PRIVATE_KEY="${WORKER_PRIVATE_KEY:-0x8b3a350cf5c34c9194ca8afc2a0eae2b2aeeafce0c12cf5f8f1b2e7ab6fce201}"
export VALIDATOR_PRIVATE_KEY="${VALIDATOR_PRIVATE_KEY:-0x0f4b9bf3efb59c0a8b6dfa8172932d03cd4b16ba29cf15f9272972d4d8f90b02}"
export CHAIN_ID="${CHAIN_ID:-31337}"

# 1) start anvil
pkill -f "anvil" >/dev/null 2>&1 || true
anvil --silent --block-time 1 > /tmp/anvil.log 2>&1 &
ANVIL_PID=$!
trap "kill $ANVIL_PID || true" EXIT

# wait for port
for i in {1..60}; do
  if nc -z 127.0.0.1 8545; then break; fi
  sleep 0.5
done

# ensure artifacts
npx hardhat compile --force >/tmp/aurora-compile.log 2>&1 || (cat /tmp/aurora-compile.log && exit 1)

# seed local AGIALPHA token
npx ts-node --transpile-only demo/aurora/bin/prepare-agialpha.ts

# 2) deploy v2 defaults (governance = first anvil account by default)
DEPLOY_DEFAULTS_OUTPUT="reports/localhost/aurora/receipts/deploy.json" \
  npx hardhat run scripts/v2/deployDefaults.ts --network localhost

# 3) run the end-to-end orchestrator
npx ts-node --transpile-only demo/aurora/aurora.demo.ts --network localhost

# 4) summarize to markdown
npx ts-node --transpile-only demo/aurora/bin/aurora-report.ts --network localhost
