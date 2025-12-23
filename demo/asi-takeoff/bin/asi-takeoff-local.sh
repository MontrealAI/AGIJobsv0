#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

NET="${NETWORK:-localhost}"
SCOPE="${AURORA_REPORT_SCOPE:-asi-takeoff}"
REPORT_DIR="reports/${NET}/${SCOPE}/receipts"
DEPLOY_OUTPUT="${AURORA_DEPLOY_OUTPUT:-${REPORT_DIR}/deploy.json}"
MISSION_CONFIG="${AURORA_MISSION_CONFIG:-demo/asi-takeoff/config/mission@v2.json}"
THERMOSTAT_CONFIG="${AURORA_THERMOSTAT_CONFIG:-demo/asi-takeoff/config/asi-takeoff.thermostat@v2.json}"
REPORT_TITLE="${AURORA_REPORT_TITLE:-ASI Take-Off — Mission Report}"

# Keep Hardhat compilation fast and deterministic for demo runs. The defaults
# mirror the repo's "fast compile" profile but allow operators to override
# them via the environment when needed.
HARDHAT_FAST_COMPILE="${HARDHAT_FAST_COMPILE:-1}"
HARDHAT_VIA_IR="${HARDHAT_VIA_IR:-true}"
HARDHAT_JOBREGISTRY_VIA_IR="${HARDHAT_JOBREGISTRY_VIA_IR:-true}"
HARDHAT_COMPILE_TIMEOUT="${HARDHAT_COMPILE_TIMEOUT:-900}"
HARDHAT_FORCE_COMPILE="${HARDHAT_FORCE_COMPILE:-0}"
NODE_MAX_OLD_SPACE="${NODE_MAX_OLD_SPACE:-4096}"

# Preserve any existing NODE_OPTIONS while ensuring the compiler has enough
# headroom to avoid slowdowns or crashes during optimisation.
NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS} }--max-old-space-size=${NODE_MAX_OLD_SPACE}"

HARDHAT_ENV=(
  "HARDHAT_FAST_COMPILE=${HARDHAT_FAST_COMPILE}"
  "HARDHAT_VIA_IR=${HARDHAT_VIA_IR}"
  "HARDHAT_JOBREGISTRY_VIA_IR=${HARDHAT_JOBREGISTRY_VIA_IR}"
  "NODE_OPTIONS=${NODE_OPTIONS}"
)

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

LOG_FILE="/tmp/asi-takeoff-node.log"

compile_contracts() {
  local required_artifacts=(
    "artifacts/contracts/v2/JobRegistry.sol/JobRegistry.json"
    "artifacts/contracts/v2/Deployer.sol/Deployer.json"
  )

  local missing=0
  for artifact in "${required_artifacts[@]}"; do
    if [[ ! -f "$artifact" ]]; then
      missing=1
      break
    fi
  done

  if [[ "${HARDHAT_FORCE_COMPILE}" != "1" && $missing -eq 0 ]]; then
    echo "ℹ️  Using existing Hardhat artifacts (set HARDHAT_FORCE_COMPILE=1 to rebuild)" >&2
    return
  fi

  echo "⚙️  Precompiling contracts (fast=${HARDHAT_FAST_COMPILE}, viaIR=${HARDHAT_VIA_IR})" >&2
  local cmd=(env "${HARDHAT_ENV[@]}" npx hardhat compile)

  if command -v timeout >/dev/null 2>&1; then
    if ! timeout "${HARDHAT_COMPILE_TIMEOUT}" "${cmd[@]}"; then
      echo "❌ Contract compilation failed or timed out after ${HARDHAT_COMPILE_TIMEOUT}s." >&2
      exit 1
    fi
  else
    if ! "${cmd[@]}"; then
      echo "❌ Contract compilation failed." >&2
      exit 1
    fi
  fi
}

compile_contracts

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

dep_env() {
  DEPLOY_DEFAULTS_SKIP_VERIFY=1 \
  DEPLOY_DEFAULTS_CONFIG="demo/aurora/config/deployer.hardhat.json" \
  DEPLOY_DEFAULTS_OUTPUT="$DEPLOY_OUTPUT" \
  env "${HARDHAT_ENV[@]}" npx hardhat run --no-compile --network localhost scripts/v2/deployDefaults.ts
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
