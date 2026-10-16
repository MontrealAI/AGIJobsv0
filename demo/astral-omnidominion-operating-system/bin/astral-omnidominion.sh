#!/usr/bin/env bash
set -euo pipefail

# Validate/help/plan before root resolution, environment changes or subprocesses.
SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
if [[ "$SCRIPT_DIR" == "${BASH_SOURCE[0]}" ]]; then SCRIPT_DIR=.; fi
source "$SCRIPT_DIR/../../../scripts/lib/agi-os-first-class-launcher.sh"
agi_os_guard first-class "$@"

ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
[[ -d "$ROOT/node_modules" ]] || agi_os_fail 'Dependencies are missing; install the reviewed lockfile separately before explicit execution'
cd "$ROOT"

npm run demo:agi-os:first-class -- "$@"
