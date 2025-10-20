#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PLAN_PATH="${SCRIPT_DIR}/project-plan.national-supply-chain.json"

printf '\n🚛  National Supply Chain grand demonstration — ignition.\n\n'

if [[ -z "${NODE_ENV:-}" ]]; then
  export NODE_ENV=production
fi

export ASI_TAKEOFF_PLAN_PATH="${PLAN_PATH}"
export NATIONAL_SUPPLY_CHAIN_PLAN_PATH="${PLAN_PATH}"

cd "${ROOT_DIR}"

# 1. Execute the first-class AGI OS rehearsal with sovereign controls surfaced.
npm run demo:agi-os:first-class -- --auto-yes "$@"

# 2. Re-run the ASI take-off harness with the national supply chain roster to emit mission receipts.
npm run demo:asi-takeoff:local

# 3. Render the national supply chain intelligence kit, dashboards, and manifest.
npm run demo:national-supply-chain:v0

printf '\n✅  National Supply Chain orchestration complete. Inspect reports/national-supply-chain/ for the intelligence kit.\n\n'
