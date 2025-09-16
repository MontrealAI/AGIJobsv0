#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROCESS_NAME="operator-telemetry"
START_CMD="node agent-gateway/dist/agent-gateway/operator.js"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is required to run this script. Install it with 'npm install -g pm2'." >&2
  exit 1
fi

pushd "$REPO_ROOT" >/dev/null

npm run build:gateway

if pm2 describe "$PROCESS_NAME" >/dev/null 2>&1; then
  pm2 restart "$PROCESS_NAME" --update-env
else
  pm2 start "$START_CMD" --name "$PROCESS_NAME" --update-env
fi

popd >/dev/null
