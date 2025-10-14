#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG="config/multinational-governance.json"

if [[ ! -f "$CONFIG" ]]; then
  echo "[seed-governance] Missing $CONFIG" >&2
  exit 1
fi

AGIJOBS_GOV_CONFIG="$CONFIG" pnpm hardhat run demo/cosmic-omni-sovereign-symphony/scripts/seed-governance.ts "$@"
