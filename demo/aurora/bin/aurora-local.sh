#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# 1) start anvil
pkill -f "anvil" >/dev/null 2>&1 || true
anvil --silent --block-time 1 > /tmp/anvil.log 2>&1 &
ANVIL_PID=$!
trap "kill $ANVIL_PID || true" EXIT

# wait for port
for i in {1..60}; do
  if nc -z 127.0.0.1 8545; then break; fi
  sleep 0.5
done

# 2) deploy v2 defaults (governance = first anvil account by default)
npx hardhat run scripts/v2/deployDefaults.ts --network localhost

# 3) run the end-to-end orchestrator
npx ts-node --transpile-only demo/aurora/aurora.demo.ts --network localhost

# 4) summarize to markdown
npx ts-node --transpile-only demo/aurora/bin/aurora-report.ts --network localhost
