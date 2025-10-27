#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
python -m kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v6.cli launch --config "${DEMO_ROOT}/config/mission.json" "$@"
