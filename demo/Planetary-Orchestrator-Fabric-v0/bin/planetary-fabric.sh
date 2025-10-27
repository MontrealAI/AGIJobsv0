#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../" && pwd)"
export PYTHONPATH="${REPO_ROOT}/demo/Planetary-Orchestrator-Fabric-v0/src:${PYTHONPATH:-}"
python -m planetary_fabric.cli "$@"
