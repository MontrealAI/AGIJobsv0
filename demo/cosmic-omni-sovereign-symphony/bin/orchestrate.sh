#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
  cat <<USAGE
Usage: $0 [--ci] [--dry-run]
  --ci       Skip interactive prompts and emit CI friendly logs.
  --dry-run  Do not broadcast transactions; run simulations only.
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
      echo "[orchestrate] Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

LOG_DIR="logs"
mkdir -p "$LOG_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export AGIJOBS_DEMO_DRY_RUN=$DRY_RUN

exec 3>&1 1>>"$LOG_DIR/orchestrate.log" 2>&1

echo "[$(date --iso-8601=seconds)] [orchestrate] Starting pipeline (CI_MODE=$CI_MODE, DRY_RUN=$DRY_RUN)"

run_step() {
  local name="$1"
  shift
  echo "[$(date --iso-8601=seconds)] [orchestrate] >>> $name"
  "$@"
}

run_step "Install dependencies" pnpm install --frozen-lockfile
run_step "Lint" pnpm lint || true
run_step "Compile contracts" pnpm hardhat compile
run_step "Run governance test suite" pnpm hardhat test test/v2/GlobalGovernanceCouncil.test.ts

if command -v forge >/dev/null 2>&1; then
  run_step "Run Foundry snapshot" forge test --match-contract GlobalGovernanceCouncil || true
else
  echo "[$(date --iso-8601=seconds)] [orchestrate] forge not installed, skipping Foundry tests"
fi

run_step "Generate execution plan" pnpm tsx demo/cosmic-omni-sovereign-symphony/scripts/generate-plan.ts "$DRY_RUN"

echo "[$(date --iso-8601=seconds)] [orchestrate] Pipeline complete"

exec 1>&3 3>&-

echo "Pipeline logs captured at $LOG_DIR/orchestrate.log"
