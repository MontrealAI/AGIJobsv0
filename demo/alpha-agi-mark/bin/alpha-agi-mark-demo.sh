#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
DEMO_DIR="$ROOT_DIR/demo/alpha-agi-mark"
REPORT_DIR="$ROOT_DIR/reports/demo-alpha-agi-mark"
mkdir -p "$REPORT_DIR"

if [[ "${CI:-}" == "true" ]]; then
  echo "[CI] Running α-AGI MARK demo"
fi

npx hardhat compile --config "$DEMO_DIR/hardhat.config.ts"

npx hardhat run --config "$DEMO_DIR/hardhat.config.ts" "$DEMO_DIR/scripts/runDemo.ts" 2>&1 | tee "$REPORT_DIR/demo-run.log"
