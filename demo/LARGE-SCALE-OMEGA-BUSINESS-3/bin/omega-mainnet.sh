#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

mkdir -p reports/omega-business-3

printf '\n🌐 Initiating Omega-grade mainnet deployment...\n\n'

npm run deploy:env -- --network mainnet
npm run deploy:checklist -- --network mainnet
npm run deploy:oneclick:auto -- --network mainnet "$@"
npm run owner:change-ticket -- --network mainnet --format markdown --output reports/omega-business-3/mainnet-change-ticket.md
