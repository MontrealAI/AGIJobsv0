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
  set +e
  "$@"
  local status=$?
  set -e
  return $status
}

run_step "Install dependencies" npm ci
run_step "Lint" npm run lint || true
run_step "Compile contracts" npx hardhat compile
run_step "Run governance test suite" npx hardhat test test/v2/GlobalGovernanceCouncil.test.ts

if command -v forge >/dev/null 2>&1; then
  run_step "Run Foundry snapshot" forge test --match-contract GlobalGovernanceCouncil || true
else
  echo "[$(date --iso-8601=seconds)] [orchestrate] forge not installed, skipping Foundry tests"
fi

LEDGER_PATH="$LOG_DIR/ledger-latest.json"

HARDHAT_NODE_PID=""

cleanup() {
  if [[ -n "$HARDHAT_NODE_PID" ]] && kill -0 "$HARDHAT_NODE_PID" >/dev/null 2>&1; then
    echo "[$(date --iso-8601=seconds)] [orchestrate] Shutting down Hardhat node (pid=$HARDHAT_NODE_PID)"
    kill "$HARDHAT_NODE_PID" >/dev/null 2>&1 || true
    wait "$HARDHAT_NODE_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

start_hardhat_node() {
  local log_file="$LOG_DIR/hardhat-node.log"
  npx hardhat node --hostname 127.0.0.1 --port 8545 >"$log_file" 2>&1 &
  HARDHAT_NODE_PID=$!

  for _ in {1..20}; do
    if ! kill -0 "$HARDHAT_NODE_PID" >/dev/null 2>&1; then
      echo "[$(date --iso-8601=seconds)] [orchestrate] Hardhat node terminated unexpectedly"
      cat "$log_file"
      return 1
    fi
    if grep -q "Started HTTP" "$log_file"; then
      echo "[$(date --iso-8601=seconds)] [orchestrate] Hardhat node ready (pid=$HARDHAT_NODE_PID)"
      return 0
    fi
    sleep 1
  done

  echo "[$(date --iso-8601=seconds)] [orchestrate] Timed out waiting for Hardhat node"
  cat "$log_file"
  return 1
}

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[$(date --iso-8601=seconds)] [orchestrate] Dry run enabled – broadcasting will be skipped where supported"
fi

run_step "Launch persistent Hardhat node" start_hardhat_node

run_step "Deploy GlobalGovernanceCouncil" npx hardhat run --network localhost demo/cosmic-omni-sovereign-symphony/scripts/deploy-governance.ts
run_step "Seed multinational governance" npx hardhat run --network localhost demo/cosmic-omni-sovereign-symphony/scripts/seed-governance.ts
run_step "Simulate nation voting & owner controls" npx hardhat run --network localhost demo/cosmic-omni-sovereign-symphony/scripts/simulate-governance.ts
run_step "Export governance ledger" npx hardhat run --network localhost demo/cosmic-omni-sovereign-symphony/scripts/export-ledger.ts -- --output "$LEDGER_PATH"
run_step "Publish knowledge graph payload" node demo/cosmic-omni-sovereign-symphony/scripts/publish-knowledge-graph.js "$LEDGER_PATH"

run_step "Generate execution plan" node demo/cosmic-omni-sovereign-symphony/scripts/generate-plan.js "$DRY_RUN"

echo "[$(date --iso-8601=seconds)] [orchestrate] Pipeline complete"

exec 1>&3 3>&-

echo "Pipeline logs captured at $LOG_DIR/orchestrate.log"
