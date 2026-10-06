#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"
if [[ "${1:-}" == "--stack" ]]; then
  shift
  exec node demo/LARGE-SCALE-OMEGA-BUSINESS-3/ui/stack.cjs "$@"
fi
exec node demo/LARGE-SCALE-OMEGA-BUSINESS-3/ui/server.cjs "$@"
