#!/usr/bin/env bash
set -euo pipefail

if [ "${CI:-}" != "" ]; then
  echo "CI environment detected"
fi

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT_DIR"

log() {
  local message="$1"
  printf '\n\033[1;36m→ %s\033[0m\n' "$message"
}

run_step() {
  local description="$1"
  shift
  log "$description"
  "$@"
}

log "Preparing AGI Jobs v2 CI reproducibility run"

run_step "Installing root dependencies" npm ci
run_step "Static analysis (Solhint + ESLint)" npm run lint:check
run_step "Protocol + Node test suite" npm test

if [ -n "${MAINNET_RPC_URL:-}" ]; then
  run_step "Mainnet fork integration tests" npm run test:fork
else
  log "Skipping fork tests (MAINNET_RPC_URL not configured)"
fi

run_step "Local gateway integration tests" npm run e2e:local
run_step "Owner console type-check" npm run webapp:typecheck
run_step "Owner console lint" npm run webapp:lint
run_step "Owner console build" npm run webapp:build
run_step "Enterprise portal build" npm --prefix apps/enterprise-portal run build
run_step "Web UI Cypress E2E" npm run webapp:e2e

log "V2 CI run completed successfully"
