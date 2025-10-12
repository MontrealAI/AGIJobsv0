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

pkill -f "anvil" >/dev/null 2>&1 || true
anvil --silent --block-time 1 > /tmp/anvil.log 2>&1 &
ANVIL_PID=$!
trap "kill $ANVIL_PID >/dev/null 2>&1 || true" EXIT

for _ in {1..60}; do
  if nc -z 127.0.0.1 8545; then
    break
  fi
  sleep 0.5
done

MANIFEST="deployment-config/latest-deployment.localhost.json"

npx hardhat run scripts/v2/deployDefaults.ts --network localhost -- \
  --config deployment-config/deployer.sample.json \
  --output "$MANIFEST"

export AURORA_DEPLOYMENT_MANIFEST="$MANIFEST"
export AGI_DEMO_NETWORK="localhost"

npx ts-node --transpile-only demo/aurora/aurora.demo.ts --network localhost

npx ts-node --transpile-only demo/aurora/bin/aurora-report.ts --network localhost
