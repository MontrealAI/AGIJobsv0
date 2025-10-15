#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

printf '\n💬 Launching Trident Sovereign enterprise portal on http://localhost:3001 ...\n\n'

npm --prefix apps/enterprise-portal run dev "$@"
