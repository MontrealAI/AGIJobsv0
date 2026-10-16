#!/usr/bin/env bash
set -euo pipefail

function usage() {
  cat <<USAGE
Usage: $0 --network localhost [--mode dry-run|execute]

Default dry-run prints a read-only command plan. It runs no deployment, RPC,
package command or filesystem operation. Explicit execute starts operational
commands and requires a separately qualified local configuration and operator approval.
USAGE
}

fail() { echo "Error: $*" >&2; exit 2; }
NETWORK=""
MODE="dry-run"
SEEN_NETWORK=false
SEEN_MODE=false
if [[ $# -eq 1 && ( "$1" == "--help" || "$1" == "-h" ) ]]; then
  usage
  exit 0
fi
while [[ $# -gt 0 ]]; do
  case "$1" in
    --network)
      $SEEN_NETWORK && fail "Duplicate --network"
      [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || fail "--network requires a value"
      NETWORK="$2"; SEEN_NETWORK=true; shift 2 ;;
    --mode)
      $SEEN_MODE && fail "Duplicate --mode"
      [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || fail "--mode requires a value"
      MODE="$2"; SEEN_MODE=true; shift 2 ;;
    *) fail "Unknown argument: $1 (use --help alone)" ;;
  esac
done
[[ "$NETWORK" == "localhost" ]] || fail "Only --network localhost is supported by this launcher"
[[ "$MODE" == "dry-run" || "$MODE" == "execute" ]] || fail "--mode must be dry-run or execute"

if [[ "$MODE" == "dry-run" ]]; then
  printf '%s\n' \
    'Read-only plan; no commands executed and no configuration qualified.' \
    '1. Review local deployment configuration, ownership and signing authority.' \
    '2. Explicit execute would run the one-click deployment wizard on localhost.' \
    '3. It would update pause wiring and the identity registry, then save templates.' \
    'The downstream wizard does not implement --dry-run; this plan never invokes it.'
  exit 0
fi
ROOT_DIR="$(git rev-parse --show-toplevel)"
REPORT_DIR="$ROOT_DIR/reports/omni-orchestrator-singularity/latest"
mkdir -p "$REPORT_DIR"

log() {
  echo "[omni-orchestrator] $*"
}

log "network=$NETWORK mode=$MODE"

log "Executing one-click deployment"
npx ts-node scripts/v2/oneclick-stack.ts --network "$NETWORK" | tee "$REPORT_DIR/deployment.log"

log "Verifying owner control wiring"
npx hardhat run --no-compile scripts/v2/updateSystemPause.ts --network "$NETWORK" -- --execute \
  | tee "$REPORT_DIR/system-pause.log"
npx hardhat run --no-compile scripts/v2/verifyOwnerControl.ts --network "$NETWORK" -- --json \
  | tee "$REPORT_DIR/owner-control.json"

log "Seeding identity registry"
npm run identity:update -- --network "$NETWORK" --config demo/omni-orchestrator-singularity/config/identities.example.json | tee "$REPORT_DIR/identities.log"

log "Capturing orchestrator plan pipeline instructions"
cat demo/omni-orchestrator-singularity/docs/mandate-script.md > "$REPORT_DIR/mandate-script.md"

log "Recording governance drill templates"
cp demo/omni-orchestrator-singularity/config/emergency-drill.json "$REPORT_DIR/emergency-drill.json"

log "Done. Follow README.md for interactive steps."
