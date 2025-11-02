#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  cat <<USAGE
Usage: $0 [--ci] [--dry-run]
  --ci       Emit CI-friendly logs and disable interactive confirmations.
  --dry-run  Forward dry-run mode to orchestrated components when available.
USAGE
}

CI_MODE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ci)
      CI_MODE=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[flagship] Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

LOG_DIR="logs/flagship-demo"
LOG_FILE="$LOG_DIR/flagship-demo.log"
mkdir -p "$LOG_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

REPO_ROOT="$(realpath ..)"
WORKSPACE_ROOT="$(realpath "$REPO_ROOT/..")"

log() {
  local level="$1"
  shift
  printf '[%s] [flagship] [%s] %s\n' "$(date --iso-8601=seconds)" "$level" "$*" | tee -a "$LOG_FILE"
}

run_step() {
  local name="$1"
  shift
  log INFO ">>> $name"
  if "$@" > >(tee -a "$LOG_FILE") 2> >(tee -a "$LOG_FILE" >&2); then
    log INFO "<<< $name"
  else
    local status=$?
    log ERROR "Step failed: $name"
    exit $status
  fi
}

ORCHESTRATE_ARGS=("--ci")
if [[ "$CI_MODE" != "true" ]]; then
  ORCHESTRATE_ARGS=()
fi
if [[ "$DRY_RUN" == "true" ]]; then
  ORCHESTRATE_ARGS+=("--dry-run")
  export AGIJOBS_DEMO_DRY_RUN=true
fi

log INFO "Starting AGI Jobs flagship operating system rehearsal (CI_MODE=$CI_MODE, DRY_RUN=$DRY_RUN)"

if [[ "$CI_MODE" == "true" ]]; then
  export CYPRESS_INSTALL_BINARY="${CYPRESS_INSTALL_BINARY:-0}"
  log INFO "CI mode enabled – forcing CYPRESS_INSTALL_BINARY=$CYPRESS_INSTALL_BINARY to skip binary download"
  export AGIJOBS_FLAGSHIP_SKIP_ONCHAIN="${AGIJOBS_FLAGSHIP_SKIP_ONCHAIN:-true}"
  log INFO "CI mode enabled – defaulting AGIJOBS_FLAGSHIP_SKIP_ONCHAIN=$AGIJOBS_FLAGSHIP_SKIP_ONCHAIN"
fi

if [[ -d "$WORKSPACE_ROOT/node_modules" ]]; then
  log INFO "node_modules detected at $WORKSPACE_ROOT/node_modules – skipping npm ci"
else
  run_step "Seed toolchain" bash -c "cd \"$WORKSPACE_ROOT\" && npm ci"
fi
export SKIP_NPM_CI=true
run_step "Execute governance symphony" ./bin/orchestrate.sh "${ORCHESTRATE_ARGS[@]}"
run_step "Simulate AGI OS mission" bash -c "cd '$REPO_ROOT' && npm run demo:agi-os"
if [[ "${AGIJOBS_FLAGSHIP_SKIP_ONCHAIN:-false}" == "true" ]]; then
  run_step "Capture owner control matrix" bash -c "cd '$REPO_ROOT' && (npm run owner:parameters || { echo '[owner:parameters] Non-zero exit tolerated with AGIJOBS_FLAGSHIP_SKIP_ONCHAIN=true'; exit 0; })"
else
  run_step "Capture owner control matrix" bash -c "cd '$REPO_ROOT' && npm run owner:parameters"
fi

MERMAID_INPUT="docs/architecture.mmd"
MERMAID_OUTPUT="docs/architecture.svg"
if command -v mmdc >/dev/null 2>&1; then
  run_step "Render governance diagram" mmdc -i "$MERMAID_INPUT" -o "$MERMAID_OUTPUT"
elif npx --no-install @mermaid-js/mermaid-cli --help >/dev/null 2>&1; then
  run_step "Render governance diagram" npx --no-install @mermaid-js/mermaid-cli -i "$MERMAID_INPUT" -o "$MERMAID_OUTPUT"
else
  log WARN "Mermaid CLI not available; skipping diagram render"
fi

SUMMARY_PATH="$LOG_DIR/summary.txt"
cat <<SUMMARY >"$SUMMARY_PATH"
AGI Jobs v0 (v2) Flagship Demo Completed
========================================
- Governance ledger: demo/cosmic-omni-sovereign-symphony/logs/ledger-latest.json
- Vote simulation: demo/cosmic-omni-sovereign-symphony/logs/vote-simulation.json
- Knowledge graph payloads: demo/cosmic-omni-sovereign-symphony/logs/
- Mission bundle: reports/agi-os/
- Owner control matrix: reports/agi-os/owner-control-matrix.json (generated via npm run owner:parameters)
- Verification report: demo/cosmic-omni-sovereign-symphony/logs/flagship-demo/verification.json
SUMMARY

VERIFY_CMD=("node" "./scripts/verify-flagship-report.mjs")
VERIFY_CMD+=("--reports-root" "$WORKSPACE_ROOT/reports/agi-os")
run_step "Verify flagship artefacts" "${VERIFY_CMD[@]}"

log INFO "Summary available at $SUMMARY_PATH"
log INFO "Flagship demo finished"
