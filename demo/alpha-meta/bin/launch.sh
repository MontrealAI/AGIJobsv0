#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PLAN_PATH="${SCRIPT_DIR}/config/project-plan.alpha-meta.json"

printf '\n🚀  Alpha-Meta meta-agentic sovereign orchestration — ignition.\n\n'

if [[ -z "${NODE_ENV:-}" ]]; then
  export NODE_ENV=production
fi

export ASI_TAKEOFF_PLAN_PATH="${PLAN_PATH}"

cd "${ROOT_DIR}"

# 1. Execute the first-class operating system drill with unstoppable owner supremacy.
npm run demo:agi-os:first-class -- --auto-yes "$@"

# 2. Generate the Alpha-Meta governance dossier, CI audit, and owner diagnostics bundle.
npm run demo:alpha-meta:full

# 3. Replay the ASI take-off harness using the alpha-meta constellation mission plan.
npm run demo:asi-takeoff:local "$@"

printf '\n✅  Alpha-Meta constellation sealed. Artifacts under demo/alpha-meta/reports and reports/agi-os|asi-takeoff.\n\n'
