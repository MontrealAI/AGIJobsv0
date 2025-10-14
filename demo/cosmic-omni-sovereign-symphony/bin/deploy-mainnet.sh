#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "[deploy-mainnet] Missing .env file. Copy config/.env.example first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${ETH_RPC_URL:?Must provide ETH_RPC_URL}"
: "${DEPLOYER_PRIVATE_KEY:?Must provide DEPLOYER_PRIVATE_KEY}"

read -r -p "Deploy to Ethereum mainnet using $ETH_RPC_URL? (yes/no) " response
if [[ "$response" != "yes" ]]; then
  echo "[deploy-mainnet] Aborting deployment."
  exit 0
fi

pnpm hardhat run --network mainnet demo/cosmic-omni-sovereign-symphony/scripts/deploy-governance.ts
