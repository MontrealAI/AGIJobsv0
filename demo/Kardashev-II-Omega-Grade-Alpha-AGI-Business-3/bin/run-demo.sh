#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
export PYTHONPATH="$REPO_ROOT${PYTHONPATH:+:$PYTHONPATH}"
CONFIG_PATH="$ROOT_DIR/config/default.json"
exec python -m demo.kardashev_ii_omega_grade_alpha_agi_business_3 --config "$CONFIG_PATH" "$@"
