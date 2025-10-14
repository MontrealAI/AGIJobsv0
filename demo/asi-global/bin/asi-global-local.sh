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
    export HARDHAT_GAS_LIMIT="$gas_limit"
    export HARDHAT_CODE_SIZE_LIMIT="$code_size_limit"
    npx hardhat node \
      --hostname 127.0.0.1 \
      --port 8545 \
      >"$log_file" 2>&1 &
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

if [[ "${NODE_KIND:-}" == "hardhat" ]]; then
  node <<'NODE'
  (async () => {
    const endpoint = 'http://127.0.0.1:8545';
    const gasLimit = BigInt(process.env.HARDHAT_GAS_LIMIT ?? process.env.LOCAL_GAS_LIMIT ?? '1000000000');
    const codeSizeLimit = Number(process.env.HARDHAT_CODE_SIZE_LIMIT ?? process.env.LOCAL_CODE_SIZE_LIMIT ?? '1000000');

    const fetchImpl = globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('fetch API not available in current Node runtime');
    }

    async function rpc(method, params) {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
      });
      if (!response.ok) {
        throw new Error(`${method} HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (payload.error) {
        throw new Error(`${method} ${JSON.stringify(payload.error)}`);
      }
      return payload.result;
    }

    const isMethodUnsupported = (error) => {
      if (!error) {
        return false;
      }
      const message = String(error.message ?? error);
      return (
        message.includes('not supported') ||
        message.includes('Method hardhat_setBlockGasLimit is not supported') ||
        message.includes('Method hardhat_setCodeSizeLimit is not supported')
      );
    };

    try {
      await rpc('hardhat_setBlockGasLimit', [`0x${gasLimit.toString(16)}`]);
    } catch (err) {
      if (isMethodUnsupported(err)) {
        console.info('ℹ️  hardhat_setBlockGasLimit is not supported on this node; skipping');
      } else {
        console.warn(`⚠️  hardhat_setBlockGasLimit failed: ${err.message}`);
      }
    }

    try {
      await rpc('hardhat_setCodeSizeLimit', [codeSizeLimit]);
    } catch (err) {
      if (isMethodUnsupported(err)) {
        console.info('ℹ️  hardhat_setCodeSizeLimit is not supported on this node; skipping');
      } else {
        console.warn(`⚠️  hardhat_setCodeSizeLimit failed: ${err.message}`);
      }
    }
  })().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
NODE
fi

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
