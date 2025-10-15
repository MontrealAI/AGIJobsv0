#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}" || exit 1

owner_port="${OWNER_CONSOLE_PORT:-3000}"
portal_port="${ENTERPRISE_PORTAL_PORT:-3001}"
validator_port="${VALIDATOR_DASHBOARD_PORT:-3002}"

pids=()

function shutdown() {
  if [[ ${#pids[@]} -gt 0 ]]; then
    printf '\n⏹️  Shutting down Omega demo services...\n' >&2
    for pid in "${pids[@]}"; do
      if kill -0 "$pid" >/dev/null 2>&1; then
        kill "$pid" >/dev/null 2>&1 || true
        wait "$pid" 2>/dev/null || true
      fi
    done
  fi
}

trap shutdown EXIT INT TERM

printf '\n🏛️  Spinning up the Omega-grade control constellation...\n'
printf '   • Owner Console      → http://localhost:%s\n' "$owner_port"
printf '   • Enterprise Portal → http://localhost:%s\n' "$portal_port"
printf '   • Validator Desk    → http://localhost:%s\n\n' "$validator_port"

(PORT="$owner_port" npm --prefix apps/console run dev >/tmp/omega-owner-console.log 2>&1 &)
pids+=("$!")
(PORT="$portal_port" npm --prefix apps/enterprise-portal run dev >/tmp/omega-enterprise-portal.log 2>&1 &)
pids+=("$!")
(PORT="$validator_port" npm --prefix apps/validator-ui run dev >/tmp/omega-validator-ui.log 2>&1 &)
pids+=("$!")

printf 'Logs: %s\n' "/tmp/omega-owner-console.log"
printf '      %s\n' "/tmp/omega-enterprise-portal.log"
printf '      %s\n\n' "/tmp/omega-validator-ui.log"

printf 'Press Ctrl+C to terminate all three services together.\n\n'

wait
