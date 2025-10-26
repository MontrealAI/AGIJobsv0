#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
python "${PROJECT_ROOT}/run_demo.py" run --base-path "${PROJECT_ROOT}" "$@"
