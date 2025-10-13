#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

NET="localhost"
REPORT_DIR="reports/${NET}/aurora/receipts"
DEPLOY_OUTPUT="${REPORT_DIR}/deploy.json"

mkdir -p "$REPORT_DIR"
export DEPLOY_DEFAULTS_OUTPUT="$DEPLOY_OUTPUT"
export AURORA_DEPLOY_OUTPUT="$DEPLOY_OUTPUT"

pkill -f "[a]nvil" >/dev/null 2>&1 || true
pkill -f "hardhat node" >/dev/null 2>&1 || true

# wait for port
for i in {1..60}; do
  if nc -z 127.0.0.1 8545; then break; fi
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

# 2) deploy v2 defaults (governance = first anvil account by default)
npx hardhat run scripts/v2/deployDefaults.ts --network localhost

# 3) run the end-to-end orchestrator
npx ts-node --transpile-only demo/aurora/aurora.demo.ts --network localhost

# 4) summarize to markdown
npx ts-node --transpile-only demo/aurora/bin/aurora-report.ts --network localhost
