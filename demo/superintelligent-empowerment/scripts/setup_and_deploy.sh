#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
OUTPUT_DIR="$ROOT_DIR/output"

python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"
python -m pip install --upgrade pip
python -m pip install -r "$ROOT_DIR/code/requirements.txt"

python "$ROOT_DIR/code/run_demo.py" \
  --config "$ROOT_DIR/configs/mission.yaml" \
  --output "$OUTPUT_DIR/report.json"
