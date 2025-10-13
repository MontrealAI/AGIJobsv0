#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

NET="localhost"
REPORT_DIR="reports/${NET}/aurora/receipts"
DEPLOY_OUTPUT="${REPORT_DIR}/deploy.json"

mkdir -p "$REPORT_DIR"

# 1) start anvil
pkill -f "anvil" >/dev/null 2>&1 || true
pkill -f "hardhat node" >/dev/null 2>&1 || true

if command -v anvil >/dev/null 2>&1; then
  echo "Starting Anvil local chain"
  anvil --silent --block-time 1 > /tmp/anvil.log 2>&1 &
else
  echo "⚠️  anvil not found; falling back to Hardhat node"
  npx hardhat node --hostname 127.0.0.1 --port 8545 > /tmp/anvil.log 2>&1 &
fi
CHAIN_PID=$!
trap "kill $CHAIN_PID >/dev/null 2>&1 || true" EXIT

# wait for port
for _ in {1..60}; do
  if nc -z 127.0.0.1 8545; then break; fi
  sleep 0.5
done

# 2) ensure mock AGIALPHA token exists for local runs
npx hardhat run demo/aurora/bin/inject-agialpha.ts --network localhost

# 3) deploy v2 defaults (governance = first anvil account by default)
DEPLOY_DEFAULTS_SKIP_VERIFY=1 \
DEPLOY_DEFAULTS_OUTPUT="$DEPLOY_OUTPUT" \
DEPLOY_DEFAULTS_CONFIG="demo/aurora/config/deployer.local.json" \
npx hardhat run scripts/v2/deployDefaults.ts --network localhost

# 4) run the end-to-end orchestrator
AURORA_DEPLOY_OUTPUT="$DEPLOY_OUTPUT" \
NETWORK="$NET" \
npx ts-node --transpile-only demo/aurora/aurora.demo.ts --network localhost

# 5) summarize to markdown
AURORA_DEPLOY_OUTPUT="$DEPLOY_OUTPUT" \
NETWORK="$NET" \
npx ts-node --transpile-only demo/aurora/bin/aurora-report.ts --network localhost
