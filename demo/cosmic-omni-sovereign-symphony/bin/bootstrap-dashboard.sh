#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "[bootstrap-dashboard] Missing .env file" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${GRAFANA_URL:?Must provide GRAFANA_URL}"
: "${GRAFANA_TOKEN:?Must provide GRAFANA_TOKEN}"

curl -sS -X POST "$GRAFANA_URL/api/dashboards/db" \
  -H "Authorization: Bearer $GRAFANA_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @dashboards/global-governance.json | jq '.status'
