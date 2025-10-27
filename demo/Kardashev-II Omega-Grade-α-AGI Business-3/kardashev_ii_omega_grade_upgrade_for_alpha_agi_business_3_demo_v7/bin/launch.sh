#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PACKAGE_PARENT="$(cd "${DEMO_ROOT}/.." && pwd)"

if [[ -n "${PYTHONPATH:-}" ]]; then
  export PYTHONPATH="${PACKAGE_PARENT}:${DEMO_ROOT}:${PYTHONPATH}"
else
  export PYTHONPATH="${PACKAGE_PARENT}:${DEMO_ROOT}"
fi

exec python -m kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v7.cli \
  launch \
  --config "${DEMO_ROOT}/config/mission.json" \
  "$@"
