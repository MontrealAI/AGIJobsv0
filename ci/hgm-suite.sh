#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() {
  echo "[hgm-suite] $*"
}

export PYTEST_DISABLE_PLUGIN_AUTOLOAD="${PYTEST_DISABLE_PLUGIN_AUTOLOAD:-1}"
export AGIALPHA_PROFILE="${AGIALPHA_PROFILE:-agialpha}"

log "Validating AGIALPHA profile configuration"
node scripts/validate-config.js

log "Linting guided demo assets"
npm run demo:hgm:lint --silent

log "Running backend/orchestrator regression tests"
python -m pytest tests/backend tests/orchestrator tests/routes/test_hgm_routes.py --maxfail=1 -q

log "Running HGM demo unit tests"
python -m pytest demo/Huxley-Godel-Machine-v0/tests --maxfail=1 -q

log "Running HGM core unit tests"
python -m pytest packages/hgm-core/tests --maxfail=1 -q

log "Executing guided demo smoke test"
REPORT_DIR="$(mktemp -d)"
trap 'rm -rf "${REPORT_DIR}"' EXIT
HGM_GUIDED_PACE="0.4s" HGM_REPORT_DIR="${REPORT_DIR}" node demo/Huxley-Godel-Machine-v0/scripts/demo_hgm.js --seed 3 --set simulation.total_steps=24 --set simulation.report_interval=6 >/tmp/hgm-demo.log 2>&1 || {
  cat /tmp/hgm-demo.log
  exit 1
}
log "Guided demo smoke output"
sed -n '1,120p' /tmp/hgm-demo.log
