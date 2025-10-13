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
pkill -f "[a]nvil" >/dev/null 2>&1 || true
pkill -f "hardhat node" >/dev/null 2>&1 || true

start_node() {
  local log_file=$1
  if command -v anvil >/dev/null 2>&1; then
    echo "ℹ️  Starting Anvil node" >&2
    anvil --silent --block-time 1 >"$log_file" 2>&1 &
    NODE_PID=$!
    NODE_KIND="anvil"
  else
    echo "⚠️  Anvil not found; falling back to Hardhat node" >&2
    npx hardhat node --hostname 127.0.0.1 --port 8545 >"$log_file" 2>&1 &
    NODE_PID=$!
    NODE_KIND="hardhat"
  fi
}

cleanup() {
  if [[ -n "${NODE_PID:-}" ]]; then
    kill "$NODE_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

LOG_FILE="/tmp/aurora-local-node.log"
start_node "$LOG_FILE"

for attempt in {1..120}; do
  if nc -z 127.0.0.1 8545 >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
  if ! kill -0 "$NODE_PID" >/dev/null 2>&1; then
    echo "❌ Local node exited unexpectedly. Inspect $LOG_FILE for details." >&2
    exit 1
  fi
  if [[ $attempt -eq 120 ]]; then
    echo "❌ Timed out waiting for local node. Inspect $LOG_FILE for details." >&2
    exit 1
  fi
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
dep_env() {
  DEPLOY_DEFAULTS_SKIP_VERIFY=1 \
  DEPLOY_DEFAULTS_OUTPUT="$DEPLOY_OUTPUT" \
  npx hardhat run scripts/v2/deployDefaults.ts --network localhost
}

run_demo() {
  AURORA_DEPLOY_OUTPUT="$DEPLOY_OUTPUT" \
  NETWORK="$NET" \
  npx ts-node --transpile-only demo/aurora/aurora.demo.ts --network localhost
}

render_report() {
  AURORA_DEPLOY_OUTPUT="$DEPLOY_OUTPUT" \
  NETWORK="$NET" \
  npx ts-node --transpile-only demo/aurora/bin/aurora-report.ts --network localhost
}

dep_env
run_demo
render_report
