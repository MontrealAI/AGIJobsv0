#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEMO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
CONFIG_PATH="${DEMO_ROOT}/config/mission.json"
exec python -m demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra launch --config "${CONFIG_PATH}" "$@"
