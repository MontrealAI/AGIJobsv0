#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

if [[ -t 1 ]]; then
  printf '\n🚀 Launching the Astral Omnidominion Operating System Demo\n\n'
fi

npm run demo:agi-os:first-class -- "$@"
