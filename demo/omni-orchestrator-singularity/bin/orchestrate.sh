#!/usr/bin/env bash
set -euo pipefail

function usage() {
  cat <<USAGE
Usage: $0 --network <network> [--mode dry-run|execute]

Dry-run stops before broadcasting transactions. Execute mode performs full deployment and orchestration.
USAGE
}

NETWORK=""
MODE="execute"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --network)
      NETWORK="$2"
      shift 2
      ;;
    --mode)
      MODE="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$NETWORK" ]]; then
  echo "--network is required" >&2
  usage
  exit 1
fi

DRY_RUN=false
if [[ "$MODE" == "dry-run" ]]; then
  DRY_RUN=true
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
REPORT_DIR="$ROOT_DIR/reports/omni-orchestrator-singularity/latest"
mkdir -p "$REPORT_DIR"

log() {
  echo "[omni-orchestrator] $*"
}

log "network=$NETWORK mode=$MODE"

if $DRY_RUN; then
  log "Running one-click deployment script in dry-run mode"
  npx ts-node scripts/v2/oneclick-stack.ts --network "$NETWORK" --dry-run | tee "$REPORT_DIR/deployment.log"
else
  log "Executing one-click deployment"
  npx ts-node scripts/v2/oneclick-stack.ts --network "$NETWORK" | tee "$REPORT_DIR/deployment.log"
fi

log "Verifying owner control wiring"
if $DRY_RUN; then
  npx ts-node tools/owner/verify-control.ts --network "$NETWORK" --output "$REPORT_DIR/owner-control.json"
else
  npx ts-node tools/system-pause/updateSystemPause.ts --network "$NETWORK" --auto --confirm yes | tee "$REPORT_DIR/system-pause.log"
  npx ts-node tools/owner/verify-control.ts --network "$NETWORK" --output "$REPORT_DIR/owner-control.json"
fi

log "Seeding identity registry"
if $DRY_RUN; then
  log "Skipping identity registry writes in dry-run mode"
else
  npm run identity:update -- --network "$NETWORK" --config demo/omni-orchestrator-singularity/config/identities.example.json | tee "$REPORT_DIR/identities.log"
fi

log "Capturing orchestrator plan pipeline instructions"
cat demo/omni-orchestrator-singularity/docs/mandate-script.md > "$REPORT_DIR/mandate-script.md"

log "Recording governance drill templates"
cp demo/omni-orchestrator-singularity/config/emergency-drill.json "$REPORT_DIR/emergency-drill.json"

log "Done. Follow README.md for interactive steps."
