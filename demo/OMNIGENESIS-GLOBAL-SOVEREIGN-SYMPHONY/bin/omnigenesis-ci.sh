#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ROOT=$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel 2>/dev/null); then
  ROOT="${ROOT}"
else
  ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
fi
cd "$ROOT"

PLAN_PATH="${1:-demo/OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY/project-plan.json}"
REPORT_ROOT="${2:-reports/localhost/omnigenesis-global-symphony}"
SCOPE="${AURORA_REPORT_SCOPE:-omnigenesis-global-symphony}"
NETWORK="${NETWORK:-localhost}"
REPORT_TITLE="${AURORA_REPORT_TITLE:-Omnigenesis Global Sovereign Symphony — Mission Report}"

mkdir -p "$REPORT_ROOT/receipts"

export ASI_TAKEOFF_PLAN_PATH="$PLAN_PATH"
export OMNIGENESIS_REPORT_ROOT="$REPORT_ROOT"
export OWNER_REPORT_ROOT="$REPORT_ROOT"
export AURORA_REPORT_SCOPE="$SCOPE"
export AURORA_REPORT_TITLE="$REPORT_TITLE"
export REPORT_ROOT

log() {
  echo "[omnigenesis-ci] $*" >&2
}

log "Compiling protocol and refreshing constants"
npm run compile

log "Executing Omnigenesis ASI take-off demo"
NETWORK="$NETWORK" npm run demo:asi-takeoff:local

log "Rendering governance kit"
npm run demo:asi-takeoff:kit -- --report-root "$REPORT_ROOT" --summary-md "$REPORT_ROOT/omnigenesis-report.md" --bundle "$REPORT_ROOT/receipts"

log "Producing owner surfaces"
OWNER_REPORT_ROOT="$REPORT_ROOT" npm run owner:mission-control >"$REPORT_ROOT/owner-mission-control.md"
OWNER_REPORT_ROOT="$REPORT_ROOT" npm run owner:atlas >"$REPORT_ROOT/owner-atlas.md"
npm run owner:diagram -- --report-root "$REPORT_ROOT"
OWNER_REPORT_ROOT="$REPORT_ROOT" npm run owner:parameters -- --report-root "$REPORT_ROOT" >"$REPORT_ROOT/owner-parameters.md"

log "Running thermodynamic and monitoring checks"
REPORT_ROOT="$REPORT_ROOT" npm run thermodynamics:report >"$REPORT_ROOT/thermodynamics-report.md"
REPORT_ROOT="$REPORT_ROOT" npm run monitoring:sentinels >"$REPORT_ROOT/monitoring-sentinels.json"
npm run monitoring:validate -- --report-root "$REPORT_ROOT" >"$REPORT_ROOT/monitoring-validate.log"

log "Verifying governance wiring"
npm run owner:verify-control -- --report-root "$REPORT_ROOT" >"$REPORT_ROOT/owner-verify-control.log"
npm run owner:pulse -- --report-root "$REPORT_ROOT" >"$REPORT_ROOT/owner-pulse.log"

log "Mission completed. Artefacts available under $REPORT_ROOT"
