#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a
  source .env
  set +a
fi

if ! command -v anvil >/dev/null 2>&1; then
  echo "anvil executable not found in PATH. Install Foundry (https://book.getfoundry.sh/getting-started/installation) before running the AURORA demo." >&2
  exit 1
fi

NET="localhost"
REPORT_DIR="reports/${NET}/aurora/receipts"
DEPLOY_OUTPUT="${REPORT_DIR}/deploy.json"

mkdir -p "$REPORT_DIR"

# 1) start anvil
pkill -f "anvil" >/dev/null 2>&1 || true
anvil --silent --block-time 1 > /tmp/anvil.log 2>&1 &
ANVIL_PID=$!
trap "kill $ANVIL_PID || true" EXIT

# wait for port
for _ in {1..60}; do
  if nc -z 127.0.0.1 8545; then break; fi
  sleep 0.5
done

# 2) deploy v2 defaults (governance = first anvil account by default)
DEPLOY_DEFAULTS_SKIP_VERIFY=1 \
DEPLOY_DEFAULTS_OUTPUT="$DEPLOY_OUTPUT" \
npx hardhat run scripts/v2/deployDefaults.ts --network localhost

# 3) run the end-to-end orchestrator
AURORA_DEPLOY_OUTPUT="$DEPLOY_OUTPUT" \
NETWORK="$NET" \
npx ts-node --transpile-only demo/aurora/aurora.demo.ts --network localhost

# 4) summarize to markdown
AURORA_DEPLOY_OUTPUT="$DEPLOY_OUTPUT" \
NETWORK="$NET" \
npx ts-node --transpile-only demo/aurora/bin/aurora-report.ts --network localhost
