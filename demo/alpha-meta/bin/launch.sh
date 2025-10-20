#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PLAN_PATH="${SCRIPT_DIR}/project-plan.alpha-meta.json"
REPORT_DIR="${SCRIPT_DIR}/reports"

printf '\n🛡️  Alpha Meta sovereign lattice ignition — commencing meta-agent orchestration.\n\n'

if [[ -z "${NODE_ENV:-}" ]]; then
  export NODE_ENV=production
fi

export ASI_TAKEOFF_PLAN_PATH="${PLAN_PATH}"

cd "${ROOT_DIR}"

npm run demo:alpha-meta "$@"
npm run demo:alpha-meta:validate "$@"
npm run demo:alpha-meta:owner-diagnostics "$@"
npm run demo:alpha-meta:ci "$@"
npm run demo:alpha-meta:full "$@"
npm run demo:asi-takeoff "$@"

printf '\n✅  Alpha Meta sovereign lattice complete. Evidence emitted under %s and reports/asi-takeoff/.\n\n' "${REPORT_DIR}"
