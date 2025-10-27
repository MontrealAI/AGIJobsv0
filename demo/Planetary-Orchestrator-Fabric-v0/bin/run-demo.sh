#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_CONFIG="$ROOT_DIR/demo/Planetary-Orchestrator-Fabric-v0/config/fabric.example.json"
CONFIG="${DEFAULT_CONFIG}"

ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      CONFIG="$2"
      shift 2
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

exec npx tsx "$ROOT_DIR/demo/Planetary-Orchestrator-Fabric-v0/src/index.ts" \
  --config "$CONFIG" \
  "${ARGS[@]}"
