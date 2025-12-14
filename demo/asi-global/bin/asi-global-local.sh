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

STEP_TIMEOUT="${AURORA_STEP_TIMEOUT:-900}"
RPC_URL="${AGI_RPC_URL:-http://127.0.0.1:8545}"

run_step() {
  local key=$1
  local description=$2
  shift 2

  local log_path="${REPORT_DIR}/${key}.log"
  mkdir -p "$(dirname "$log_path")"

  echo "▶️  ${description} (timeout: ${STEP_TIMEOUT}s, log: ${log_path})" >&2

  local env_parts=()
  while (($# > 0)) && [[ $1 == *=* ]]; do
    env_parts+=("$1")
    shift
  done

  local cmd=("$@")
  if ((${#env_parts[@]} > 0)); then
    cmd=(env "${env_parts[@]}" "${cmd[@]}")
  fi

  if command -v timeout >/dev/null 2>&1; then
    cmd=(timeout "${STEP_TIMEOUT}" "${cmd[@]}")
  fi

  if ! "${cmd[@]}" >"$log_path" 2>&1; then
    echo "❌ ${description} failed; last 40 log lines:" >&2
    tail -n 40 "$log_path" >&2 || true
    exit 1
  fi

  echo "✅ ${description} completed" >&2
}

LOG_FILE="/tmp/asi-global-node.log"
start_node "$LOG_FILE"

for attempt in {1..120}; do
  if node -e "const { ethers } = require('ethers'); const provider = new ethers.JsonRpcProvider('${RPC_URL}'); provider.getBlockNumber().then(() => process.exit(0)).catch(() => process.exit(1));" >/dev/null 2>&1; then
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

seed_agialpha() {
  run_step \
    "seed-agialpha" \
    "Seeding local AGIALPHA token" \
    node demo/asi-global/scripts/seed-agialpha-stub.js
}

dep_env() {
  run_step \
    "deploy" \
    "Deploying protocol defaults" \
    NETWORK="$NET" \
    AURORA_REPORT_SCOPE="$SCOPE" \
    AURORA_DEPLOY_OUTPUT="$DEPLOY_OUTPUT" \
    node demo/asi-global/scripts/deploy-stub.js
}

run_demo() {
  run_step \
    "demo" \
    "Executing Aurora mission drill" \
    AURORA_DEPLOY_OUTPUT="$DEPLOY_OUTPUT" \
    AURORA_REPORT_SCOPE="$SCOPE" \
    AURORA_MISSION_CONFIG="$MISSION_CONFIG" \
    AURORA_THERMOSTAT_CONFIG="$THERMOSTAT_CONFIG" \
    AURORA_REPORT_TITLE="$REPORT_TITLE" \
    NETWORK="$NET" \
    node demo/asi-global/scripts/aurora-demo-stub.js
}

render_report() {
  run_step \
    "report" \
    "Rendering global mission report" \
    AURORA_REPORT_SCOPE="$SCOPE" \
    AURORA_REPORT_TITLE="$REPORT_TITLE" \
    NETWORK="$NET" \
    npx ts-node --transpile-only demo/aurora/bin/aurora-report.ts
}

seed_agialpha
dep_env
run_demo
render_report
