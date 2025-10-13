#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(git rev-parse --show-toplevel)
SCOPE=${AURORA_REPORT_SCOPE:-infinity-symphony}
NETWORK=${NETWORK:-localhost}
PLAN_PATH=${ASI_TAKEOFF_PLAN_PATH:-$ROOT_DIR/demo/infinity-symphony/project-plan.json}
REPORT_ROOT="$ROOT_DIR/reports/$NETWORK/$SCOPE"
RECEIPT_MIRROR="$REPORT_ROOT/receipts"
GOV_ROOT="$REPORT_ROOT/governance"
DRY_RUN_ROOT="$ROOT_DIR/reports/asi-takeoff"
CI_MODE=false

if [[ ${1:-} == "--ci" ]]; then
  CI_MODE=true
  shift
fi

info() {
  echo "[infinity] $*"
}

mkdir -p "$RECEIPT_MIRROR" "$GOV_ROOT"

info "Running deterministic dry-run with plan: $PLAN_PATH"
export ASI_TAKEOFF_PLAN_PATH="$PLAN_PATH"
npm run demo:asi-takeoff

info "Generating governance kit"
npm run demo:asi-takeoff:kit -- \
  --report-root "$DRY_RUN_ROOT" \
  --summary-md "$DRY_RUN_ROOT/infinity-symphony-summary.md" \
  --bundle "$DRY_RUN_ROOT/mission-bundle" \
  --logs "$DRY_RUN_ROOT/logs"

if command -v shasum >/dev/null 2>&1; then
  info "Fingerprinting dry-run artefacts"
  (cd "$DRY_RUN_ROOT" && find . -type f -print0 | sort -z | xargs -0 shasum -a 256) > "$DRY_RUN_ROOT/SHA256SUMS"
fi

info "Mirroring receipts into scope: $RECEIPT_MIRROR"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$DRY_RUN_ROOT/" "$RECEIPT_MIRROR/"
else
  rm -rf "$RECEIPT_MIRROR"/*
  cp -a "$DRY_RUN_ROOT/." "$RECEIPT_MIRROR/"
fi

info "Rendering AURORA mission report"
export AURORA_REPORT_SCOPE="$SCOPE"
export AURORA_MISSION_CONFIG=${AURORA_MISSION_CONFIG:-$ROOT_DIR/demo/infinity-symphony/config/mission@v2.json}
export AURORA_THERMOSTAT_CONFIG=${AURORA_THERMOSTAT_CONFIG:-$ROOT_DIR/demo/infinity-symphony/config/infinity-symphony.thermostat@v2.json}
export AURORA_REPORT_TITLE=${AURORA_REPORT_TITLE:-"Infinity Symphony — Planetary Mission Report"}
export NETWORK
npm run demo:aurora:report

info "Regenerating owner governance artefacts"
npm run owner:atlas -- --format markdown --output "$GOV_ROOT/atlas.md" --network "$NETWORK"
npm run owner:command-center -- --format markdown --output "$GOV_ROOT/command-center.md" --network "$NETWORK"
npm run owner:mission-control -- --output "$GOV_ROOT/mission-control.md" --network "$NETWORK"
npm run owner:diagram -- --output "$GOV_ROOT/control.mmd" --network "$NETWORK"
npm run owner:parameters -- --output "$GOV_ROOT/parameter-matrix.md" --network "$NETWORK"
npm run thermodynamics:report -- --output "$GOV_ROOT/thermodynamics.md"

if $CI_MODE; then
  info "CI mode detected — verifying owner wiring"
  npm run owner:verify-control -- --network "$NETWORK"
fi

info "Infinity Symphony completed. Artefacts staged under $REPORT_ROOT"
