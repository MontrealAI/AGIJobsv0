#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
OUTPUT_DIR="$ROOT_DIR/reports/audit"
LOG_DIR="$OUTPUT_DIR/logs"
SUMMARY_FILE="$OUTPUT_DIR/summary.json"

mkdir -p "$LOG_DIR"

echo "=== AGI Jobs v0 Audit Dossier Export ==="
echo "Root directory: $ROOT_DIR"
echo "Artifacts directory: $OUTPUT_DIR"
echo "Timestamp: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

declare -a SUMMARY_ENTRIES

log_step() {
  local step_name="$1"
  shift
  local log_path="$LOG_DIR/${step_name// /_}.log"

  echo "\n--- Running: $step_name ---"
  echo "Command: $*"
  {
    echo "# $step_name"
    echo "# Command: $*"
    echo "# Started: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  } >"$log_path"

  if "$@" | tee -a "$log_path"; then
    echo "# Completed: $(date -u '+%Y-%m-%dT%H:%M:%SZ')" >>"$log_path"
    SUMMARY_ENTRIES+=("{\"step\":\"$step_name\",\"status\":\"passed\",\"log\":\"logs/${step_name// /_}.log\"}")
  else
    status=$?
    echo "# Failed: $(date -u '+%Y-%m-%dT%H:%M:%SZ')" >>"$log_path"
    SUMMARY_ENTRIES+=("{\"step\":\"$step_name\",\"status\":\"failed\",\"code\":$status,\"log\":\"logs/${step_name// /_}.log\"}")
    echo "Step '$step_name' failed with exit code $status. See $log_path for details." >&2
    exit $status
  fi
}

pushd "$ROOT_DIR" >/dev/null

log_step "Node toolchain fingerprint" node -v
log_step "NPM toolchain fingerprint" npm -v

log_step "Install dependencies" npm ci --no-audit --prefer-offline --progress=false

log_step "Static analysis" npm run lint:ci

log_step "Contracts compile" npx ts-node --compiler-options '{"module":"commonjs"}' scripts/generate-constants.ts
log_step "Hardhat compile" npx hardhat compile

log_step "Unit tests" npm test

log_step "ABI diff" npm run abi:diff

log_step "Coverage" npm run coverage
log_step "Access control coverage" npm run check:access-control

log_step "Security audit-ci" npm run security:audit

log_step "Owner control verification" npm run owner:verify-control

if command -v forge >/dev/null 2>&1; then
  log_step "Foundry tests" forge test -vvvv --ffi --fuzz-runs 256
else
  echo "Forge not found on PATH, skipping Foundry tests step." | tee "$LOG_DIR/Foundry_tests.log"
  SUMMARY_ENTRIES+=("{\"step\":\"Foundry tests\",\"status\":\"skipped\",\"log\":\"logs/Foundry_tests.log\",\"note\":\"forge not installed\"}")
fi

if command -v slither >/dev/null 2>&1; then
  log_step "Slither static analysis" slither . --fail-high --checklist --json "$OUTPUT_DIR/slither.json"
else
  echo "Slither not found on PATH, skipping Slither step." | tee "$LOG_DIR/Slither_static_analysis.log"
  SUMMARY_ENTRIES+=("{\"step\":\"Slither static analysis\",\"status\":\"skipped\",\"log\":\"logs/Slither_static_analysis.log\",\"note\":\"slither not installed\"}")
fi

cat >"$SUMMARY_FILE" <<JSON
{
  "generatedAt": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "commit": "$(git rev-parse HEAD)",
  "branch": "$(git rev-parse --abbrev-ref HEAD)",
  "steps": [
    $(IFS=,; echo "${SUMMARY_ENTRIES[*]}")
  ]
}
JSON

echo "\nDossier summary written to $SUMMARY_FILE"
echo "Logs available in $LOG_DIR"

popd >/dev/null
