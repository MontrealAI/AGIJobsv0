#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

if [[ -t 1 ]]; then
  printf '\n🌌 Initiating the Cosmic Omniversal Grand Symphony Demo\n\n'
fi

npm run demo:agi-os:first-class -- "$@"
