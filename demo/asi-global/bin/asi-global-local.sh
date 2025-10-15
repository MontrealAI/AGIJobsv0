#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

NET="${NETWORK:-localhost}"
SCOPE="${AURORA_REPORT_SCOPE:-asi-global}"
REPORT_DIR="reports/${NET}/${SCOPE}/receipts"
DEPLOY_OUTPUT="${AURORA_DEPLOY_OUTPUT:-${REPORT_DIR}/deploy.json}"
MISSION_CONFIG="${AURORA_MISSION_CONFIG:-demo/asi-global/config/mission@v2.json}"
THERMOSTAT_CONFIG="${AURORA_THERMOSTAT_CONFIG:-demo/asi-takeoff/config/asi-takeoff.thermostat@v2.json}"
REPORT_TITLE="${AURORA_REPORT_TITLE:-Global ASI Take-Off — Mission Report}"

mkdir -p "$REPORT_DIR"

pkill -f "[a]nvil" >/dev/null 2>&1 || true
pkill -f "hardhat node" >/dev/null 2>&1 || true

start_node() {
  local log_file=$1
  local gas_limit=${LOCAL_GAS_LIMIT:-1000000000}
  local code_size_limit=${LOCAL_CODE_SIZE_LIMIT:-1000000}
  if command -v anvil >/dev/null 2>&1; then
    echo "ℹ️  Starting Anvil node" >&2
    anvil \
      --silent \
      --block-time 1 \
      --gas-limit "$gas_limit" \
      --code-size-limit "$code_size_limit" \
      >"$log_file" 2>&1 &
    NODE_PID=$!
    NODE_KIND="anvil"
  else
    echo "⚠️  Anvil not found; falling back to Hardhat node" >&2
    npx hardhat node \
      --hostname 127.0.0.1 \
      --port 8545 \
      >"$log_file" 2>&1 &
    NODE_PID=$!
    NODE_KIND="hardhat"
  fi
  NODE_GAS_LIMIT=$gas_limit
  NODE_CODE_SIZE_LIMIT=$code_size_limit
}

cleanup() {
  if [[ -n "${NODE_PID:-}" ]]; then
    kill "$NODE_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

LOG_FILE="/tmp/asi-global-node.log"
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

adjust_limits() {
  local rpc_url="http://127.0.0.1:8545"
  local gas_limit_hex
  gas_limit_hex=$(printf '0x%x' "${NODE_GAS_LIMIT:-0}")
  if [[ -z "${NODE_GAS_LIMIT:-}" || -z "$gas_limit_hex" ]]; then
    return
  fi
  rpc_call() {
    local method=$1
    local param=$2
    node - "$method" "$param" "$rpc_url" <<'NODE'
const http = require('http');
const [method, param, url] = process.argv.slice(2);
const data = JSON.stringify({
  jsonrpc: '2.0',
  id: Date.now(),
  method,
  params: [param],
});
const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
  res.on('data', () => {});
});
req.on('error', (err) => {
  console.error(String(err));
  process.exitCode = 1;
});
req.write(data);
req.end();
NODE
  }
  cast_or_rpc() {
    local method=$1
    local param=$2
    if command -v cast >/dev/null 2>&1; then
      if ! cast rpc --rpc-url "$rpc_url" "$method" "$param" >/dev/null 2>&1; then
        rpc_call "$method" "$param"
      fi
    else
      rpc_call "$method" "$param"
    fi
  }
  if [[ "$NODE_KIND" == "anvil" ]]; then
    cast_or_rpc anvil_setBlockGasLimit "$gas_limit_hex" || echo "⚠️  Failed to raise Anvil block gas limit" >&2
    if [[ -n "${NODE_CODE_SIZE_LIMIT:-}" ]]; then
      local code_limit_hex
      code_limit_hex=$(printf '0x%x' "$NODE_CODE_SIZE_LIMIT")
      cast_or_rpc anvil_setCodeSizeLimit "$code_limit_hex" || echo "⚠️  Failed to raise Anvil code size limit" >&2
    fi
  else
    cast_or_rpc hardhat_setBlockGasLimit "$gas_limit_hex" || echo "⚠️  Failed to raise Hardhat block gas limit" >&2
  fi
}

adjust_limits

dep_env() {
  DEPLOY_DEFAULTS_SKIP_VERIFY=1 \
  DEPLOY_DEFAULTS_CONFIG="demo/aurora/config/deployer.hardhat.json" \
  DEPLOY_DEFAULTS_OUTPUT="$DEPLOY_OUTPUT" \
  npx hardhat run --network localhost scripts/v2/deployDefaults.ts
}

run_demo() {
  AURORA_DEPLOY_OUTPUT="$DEPLOY_OUTPUT" \
  AURORA_REPORT_SCOPE="$SCOPE" \
  AURORA_MISSION_CONFIG="$MISSION_CONFIG" \
  AURORA_THERMOSTAT_CONFIG="$THERMOSTAT_CONFIG" \
  AURORA_REPORT_TITLE="$REPORT_TITLE" \
  NETWORK="$NET" \
  npx ts-node --transpile-only demo/aurora/aurora.demo.ts --network localhost
}

render_report() {
  AURORA_REPORT_SCOPE="$SCOPE" \
  AURORA_REPORT_TITLE="$REPORT_TITLE" \
  NETWORK="$NET" \
  npx ts-node --transpile-only demo/aurora/bin/aurora-report.ts
}

dep_env
run_demo
render_report
