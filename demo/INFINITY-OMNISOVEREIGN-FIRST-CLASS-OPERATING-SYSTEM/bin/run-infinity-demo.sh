#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../" && pwd)"

cd "$ROOT_DIR"

echo "🌌 Launching the INFINITY OMNISOVEREIGN first-class operating system rehearsal"
echo "   Repository: $ROOT_DIR"
echo ""

echo "🔧 Running npm install to guarantee toolchain availability..."
npm install --no-fund --no-audit

echo "🚀 Starting the Astral Omnidominion push-button demo..."
npm run demo:agi-os:first-class -- "$@"

echo "✨ Demo orchestrator finished. Review reports/agi-os for dossiers and manifests."
