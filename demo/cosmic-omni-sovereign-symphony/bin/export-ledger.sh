#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

OUTPUT="logs/ledger-$(date +%Y%m%d%H%M%S).json"
mkdir -p logs

pnpm hardhat run demo/cosmic-omni-sovereign-symphony/scripts/export-ledger.ts "$@" --output "$OUTPUT"
echo "Ledger exported to $OUTPUT"
