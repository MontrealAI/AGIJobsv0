#!/usr/bin/env bash
set -euo pipefail

# Validate/help/plan before root resolution, environment changes or subprocesses.
SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
if [[ "$SCRIPT_DIR" == "${BASH_SOURCE[0]}" ]]; then SCRIPT_DIR=.; fi
source "$SCRIPT_DIR/../../../scripts/lib/agi-os-first-class-launcher.sh"
agi_os_guard meta-agentic "$@"

ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
[[ -d "$ROOT/node_modules" ]] || agi_os_fail 'Dependencies are missing; install the reviewed lockfile separately before explicit execution'
cd "$ROOT"

# This export is consumed by the first-class synthetic fixture only.
export ASI_TAKEOFF_PLAN_PATH="$ROOT/demo/meta-agentic-alpha-agi/project-plan.meta-alpha.json"
export NODE_ENV="${NODE_ENV:-production}"
npm run demo:agi-os:first-class -- "$@"

# The separate local replay does not consume ASI_TAKEOFF_PLAN_PATH. Pin its
# selected Aurora mission config, with the shared fixture as its default.
printf '%s\n' 'Executing a separate localhost ASI replay using AURORA_MISSION_CONFIG (shared mission@v2.json by default).'
(
  unset ASI_TAKEOFF_PLAN_PATH
  AURORA_MISSION_CONFIG="${AURORA_MISSION_CONFIG:-$ROOT/demo/asi-takeoff/config/mission@v2.json}" npm run demo:asi-takeoff:local
)
printf '%s\n' 'Selected pipelines completed. Inspect separate evidence; no production qualification is implied.'
