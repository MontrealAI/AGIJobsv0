#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$SCRIPT_DIR/.."

echo "🚀 Launching Meta-Agentic Program Synthesis full pipeline"
export AGI_META_PROGRAM_MISSION="${SCRIPT_DIR}/config/mission.meta-agentic-program-synthesis.json"
export AGI_OWNER_DIAGNOSTICS_OFFLINE="1"

npm run demo:meta-agentic-program-synthesis:full -- "$@"
