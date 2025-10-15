#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

npx ts-node --compiler-options '{"module":"commonjs"}' demo/TRIDENT-SOVEREIGN-AGI-ORCHESTRATOR/orchestrator.ts "$@"
