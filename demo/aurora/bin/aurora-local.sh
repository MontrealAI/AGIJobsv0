#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

# 1) start anvil (fallback to Hardhat node if unavailable)
pkill -f "[a]nvil" >/dev/null 2>&1 || true
pkill -f "[h]ardhat node" >/dev/null 2>&1 || true

if command -v anvil >/dev/null 2>&1; then
  anvil --silent --block-time 1 > /tmp/anvil.log 2>&1 &
else
  npx hardhat node --hostname 127.0.0.1 --port 8545 >/tmp/anvil.log 2>&1 &
fi
NODE_PID=$!
trap "kill $NODE_PID >/dev/null 2>&1 || true" EXIT

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
