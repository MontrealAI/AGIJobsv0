#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_PATH="$ROOT_DIR/config/default.json"
PYTHONPATH="$ROOT_DIR/../..":${PYTHONPATH:-}
export PYTHONPATH
exec python -m demo.kardashev_ii_omega_grade_alpha_agi_business_3_omega_upgrade --config "$CONFIG_PATH" "$@"
