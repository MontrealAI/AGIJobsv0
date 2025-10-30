#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_CONFIG="$ROOT_DIR/demo/Planetary-Orchestrator-Fabric-v0/config/fabric.example.json"

CONFIG="$DEFAULT_CONFIG"
PLAN=""
CONFIG_SET=0
PLAN_SET=0
ARGS=()

missing_value() {
  echo "Missing value for option $1" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      [[ $# -lt 2 ]] && missing_value "$1"
      CONFIG="$2"
      CONFIG_SET=1
      shift 2
      ;;
    --plan)
      [[ $# -lt 2 ]] && missing_value "$1"
      PLAN="$2"
      PLAN_SET=1
      shift 2
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ $PLAN_SET -eq 1 && $CONFIG_SET -eq 1 ]]; then
  echo "Use --config or --plan, but not both." >&2
  exit 1
fi

if [[ $PLAN_SET -eq 0 && $CONFIG_SET -eq 0 ]]; then
  CONFIG="$DEFAULT_CONFIG"
fi

CMD=(npx tsx "$ROOT_DIR/demo/Planetary-Orchestrator-Fabric-v0/src/index.ts")

if [[ $PLAN_SET -eq 1 ]]; then
  CMD+=(--plan "$PLAN")
else
  CMD+=(--config "$CONFIG")
fi

CMD+=("${ARGS[@]}")

exec "${CMD[@]}"
