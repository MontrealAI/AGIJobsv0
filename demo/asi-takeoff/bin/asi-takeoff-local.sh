#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

NET="localhost"
SCOPE="${AURORA_REPORT_SCOPE:-asi-takeoff}"
REPORT_DIR="reports/${NET}/${SCOPE}/receipts"
DEPLOY_OUTPUT="${AURORA_DEPLOY_OUTPUT:-${REPORT_DIR}/deploy.json}"
MISSION_CONFIG="${AURORA_MISSION_CONFIG:-demo/asi-takeoff/config/mission@v2.json}"
THERMOSTAT_CONFIG="${AURORA_THERMOSTAT_CONFIG:-demo/asi-takeoff/config/asi-takeoff.thermostat@v2.json}"
REPORT_TITLE="${AURORA_REPORT_TITLE:-ASI Take-Off — Mission Report}"

# Keep the production compiler profile and use incremental compilation.
# Serialize compiler jobs to bound memory use on developer machines.
HARDHAT_FAST_COMPILE="${HARDHAT_FAST_COMPILE:-0}"
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

source "$ROOT/demo/aurora/bin/local-node.sh"
prepare_local_node
node demo/aurora/bin/mission-plan.cjs "$MISSION_CONFIG"

compile_contracts() {
  echo "⚙️  Precompiling contracts (fast=${HARDHAT_FAST_COMPILE}, viaIR=${HARDHAT_VIA_IR})" >&2
  local cmd=(env "${HARDHAT_ENV[@]}" npx hardhat compile --concurrency 1)
  if [[ "${HARDHAT_FORCE_COMPILE}" == "1" ]]; then cmd+=(--force); fi

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

start_local_node

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
node scripts/production/commissioning.cjs "$REPORT_DIR" "$MISSION_CONFIG" "$DEPLOY_OUTPUT"
render_report
