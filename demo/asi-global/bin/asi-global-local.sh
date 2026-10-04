#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
export AURORA_REPORT_SCOPE="${AURORA_REPORT_SCOPE:-asi-global}"
export AURORA_REPORT_TITLE="${AURORA_REPORT_TITLE:-Global ASI Take-Off — Mission Report}"
export AURORA_MISSION_CONFIG="${AURORA_MISSION_CONFIG:-demo/asi-global/config/mission@v2.json}"
export AURORA_THERMOSTAT_CONFIG="${AURORA_THERMOSTAT_CONFIG:-demo/asi-takeoff/config/asi-takeoff.thermostat@v2.json}"

# Reuse the production-contract lifecycle and owned localhost-node cleanup.
exec bash "$ROOT/demo/asi-takeoff/bin/asi-takeoff-local.sh"
