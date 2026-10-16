#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

NETWORK=${NETWORK-localhost}
SCOPE=${AURORA_REPORT_SCOPE-infinity-symphony}
if [[ "$NETWORK" != localhost || "$SCOPE" != infinity-symphony ]]; then
  echo 'Infinity Symphony requires NETWORK=localhost and AURORA_REPORT_SCOPE=infinity-symphony (or leave them unset).' >&2
  exit 1
fi
if [[ "${ASI_TAKEOFF_REPORT_ROOT+x}" == x ]]; then
  echo 'ASI_TAKEOFF_REPORT_ROOT overrides are unsupported by this launcher. Unset it; outputs are isolated in reports/localhost/infinity-symphony/dry-run.' >&2
  exit 1
fi
CI_MODE=false
if [[ "$#" -eq 1 && "$1" == --ci ]]; then
  CI_MODE=true
elif [[ "$#" -ne 0 ]]; then
  echo 'Infinity Symphony accepts only the optional --ci flag.' >&2
  exit 1
fi

PLAN_PATH=${ASI_TAKEOFF_PLAN_PATH:-$ROOT/demo/infinity-symphony/project-plan.json}
# Resolve relative plans against this checkout, independent of the invoking cwd.
if [[ "$PLAN_PATH" != /* ]]; then PLAN_PATH="$ROOT/$PLAN_PATH"; fi
if [[ ! -f "$PLAN_PATH" ]]; then
  echo 'ASI_TAKEOFF_PLAN_PATH must name an existing plan file.' >&2
  exit 1
fi

source "$ROOT/demo/aurora/bin/local-node.sh"
lock_local_demo "$@"

REPORT_ROOT="$ROOT/reports/localhost/infinity-symphony"
RECEIPT_MIRROR="$REPORT_ROOT/receipts"
GOV_ROOT="$REPORT_ROOT/governance"
DRY_RUN_ROOT="$REPORT_ROOT/dry-run"
node "$ROOT/demo/aurora/bin/prepare-local-reports.cjs" infinity-symphony

info() {
  echo "[infinity] $*"
}

mkdir -p "$RECEIPT_MIRROR" "$GOV_ROOT"

info "Running deterministic dry-run with plan: $PLAN_PATH"
export ASI_TAKEOFF_PLAN_PATH="$PLAN_PATH"
export ASI_TAKEOFF_REPORT_ROOT="$DRY_RUN_ROOT"
npm run demo:asi-takeoff

info "Generating governance kit"
npm run demo:asi-takeoff:kit -- \
  --plan "$PLAN_PATH" \
  --report-root "$DRY_RUN_ROOT" \
  --summary-md "$DRY_RUN_ROOT/infinity-symphony-summary.md" \
  --bundle "$DRY_RUN_ROOT/mission-bundle" \
  --logs "$DRY_RUN_ROOT/logs"

if command -v shasum >/dev/null 2>&1; then
  info "Fingerprinting dry-run artefacts"
  (cd "$DRY_RUN_ROOT" && find . -type f ! -path ./SHA256SUMS -print0 | sort -z | xargs -0 shasum -a 256) > "$DRY_RUN_ROOT/SHA256SUMS"
fi

info "Mirroring receipts into scope: $RECEIPT_MIRROR"
# The entire old scope was archived before execution; this destination is new.
cp -a "$DRY_RUN_ROOT/." "$RECEIPT_MIRROR/"

info "Rendering AURORA mission report"
export AURORA_REPORT_SCOPE="$SCOPE"
export AURORA_MISSION_CONFIG=${AURORA_MISSION_CONFIG:-$ROOT/demo/infinity-symphony/config/mission@v2.json}
export AURORA_THERMOSTAT_CONFIG=${AURORA_THERMOSTAT_CONFIG:-$ROOT/demo/infinity-symphony/config/infinity-symphony.thermostat@v2.json}
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
