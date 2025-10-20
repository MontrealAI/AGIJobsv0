#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PLAN_PATH="${SCRIPT_DIR}/project-plan.meta-alpha.json"

printf '\n🚀  Meta-Agentic α-AGI grand demonstration — initiated.\n\n'

if [[ -z "${NODE_ENV:-}" ]]; then
  export NODE_ENV=production
fi

export ASI_TAKEOFF_PLAN_PATH="${PLAN_PATH}"

cd "${ROOT_DIR}"

# 1. Run the flagship first-class operating system demo (deploy, simulate, report, manifest).
npm run demo:agi-os:first-class -- --auto-yes "$@"

# 2. Replay the ASI take-off harness against the meta-agentic plan to populate multi-actor receipts.
npm run demo:asi-takeoff "$@"

printf '\n✅  Meta-Agentic α-AGI orchestration complete. Artifacts under reports/agi-os/ and reports/asi-takeoff/.\n\n'
