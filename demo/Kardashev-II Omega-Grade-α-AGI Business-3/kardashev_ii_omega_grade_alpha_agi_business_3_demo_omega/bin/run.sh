#!/usr/bin/env bash
set -euo pipefail
CONFIG_PATH=${1:-$(dirname "$0")/../config/omega_mission.json}
exec python -m kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega --config "$CONFIG_PATH" "${@:2}"
