#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/../../.. && pwd)"
cd "$ROOT_DIR"

banner() {
  printf '\n\033[1;96m%s\033[0m\n' "$1"
}

banner "🛡️  Omni-Sovereign Ascension :: Preflight"
node --version
npm --version

banner "🚀 Launching One-Click Deployment Wizard"
npm run deploy:oneclick:wizard

banner "🌌 Executing First-Class Operating System Demo"
npm run demo:agi-os:first-class -- --auto-yes "$@"

banner "📡 Live Interfaces"
cat <<INFO
Owner Console:      http://localhost:3000
Enterprise Portal:  http://localhost:3001
Validator Ops:      http://localhost:3002

Mission bundle:     reports/agi-os/first-class/
Grand summary:      reports/agi-os/grand-summary.md
INFO

banner "✅ Showcase complete"
