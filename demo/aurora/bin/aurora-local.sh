#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

NET="localhost"
REPORT_DIR="reports/${NET}/aurora/receipts"
DEPLOY_OUTPUT="${REPORT_DIR}/deploy.json"

mkdir -p "$REPORT_DIR"

# 1) start local chain (prefer anvil, fallback to hardhat node)
pkill -f "anvil" >/dev/null 2>&1 || true

if command -v anvil >/dev/null 2>&1; then
  START_CMD=(anvil --silent --block-time 1)
  echo "[aurora-local] starting anvil…" >&2
else
  echo "[aurora-local] anvil not found in PATH; falling back to \`npx hardhat node\`" >&2
  START_CMD=(npx hardhat node --hostname 127.0.0.1 --port 8545)
fi

"${START_CMD[@]}" > /tmp/aurora-chain.log 2>&1 &
CHAIN_PID=$!
trap "kill $CHAIN_PID || true" EXIT

# wait for port
check_port() {
  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 8545 >/dev/null 2>&1
  else
    bash -c '>/dev/tcp/127.0.0.1/8545' >/dev/null 2>&1
  fi
}

for _ in {1..180}; do
  if check_port; then
    break
  fi
  sleep 0.5
done

if ! check_port; then
  echo "[aurora-local] unable to reach localhost:8545 after waiting. Check /tmp/aurora-chain.log" >&2
  exit 1
fi

# 2) inject AGIALPHA bytecode for local demo compatibility
npx hardhat run demo/aurora/bin/prepare-agialpha.ts --network localhost

# 3) deploy v2 defaults (governance = first anvil account by default)
DEPLOY_DEFAULTS_SKIP_VERIFY=1 \
DEPLOY_DEFAULTS_OUTPUT="$DEPLOY_OUTPUT" \
npx hardhat run ./scripts/v2/deployDefaults.ts --network localhost

# 4) run the end-to-end orchestrator
AURORA_DEPLOY_OUTPUT="$DEPLOY_OUTPUT" \
NETWORK="$NET" \
npx ts-node --transpile-only demo/aurora/aurora.demo.ts --network localhost

# 5) summarize to markdown
AURORA_DEPLOY_OUTPUT="$DEPLOY_OUTPUT" \
NETWORK="$NET" \
npx ts-node --transpile-only demo/aurora/bin/aurora-report.ts --network localhost
