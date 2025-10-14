#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm hardhat run demo/cosmic-omni-sovereign-symphony/scripts/pause-governance.ts "$@"
