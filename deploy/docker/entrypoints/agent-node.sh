#!/usr/bin/env bash
set -euo pipefail

AGENT_ID="${AGENT_ID:-agent-001}"
AGENT_REGION="${AGENT_REGION:-us-east}"
AGENT_CAPABILITIES="${AGENT_CAPABILITIES:-execution}"
AGENT_ROUTER="${AGENT_ROUTER:-default}"
AGENT_REGISTRY_URL="${AGENT_REGISTRY_URL:-http://meta-api:8000/agents}"
AGENT_HEARTBEAT_SECRET="${AGENT_HEARTBEAT_SECRET:-changeme}"

echo "Starting AGI Jobs agent node"
echo " -> id: ${AGENT_ID}"
echo " -> region: ${AGENT_REGION}"
echo " -> capabilities: ${AGENT_CAPABILITIES}"
echo " -> router: ${AGENT_ROUTER}"

until curl -sf "${AGENT_REGISTRY_URL}" >/dev/null; do
  echo "Waiting for registry ${AGENT_REGISTRY_URL}"
  sleep 5
done

python -m http.server 8081 --bind 0.0.0.0 &

python agent_registry_cli.py register \
  "${AGENT_ID}" \
  "docker-operator" \
  "${AGENT_REGION}" \
  "${AGENT_CAPABILITIES}" \
  "1000" \
  "${AGENT_HEARTBEAT_SECRET}" \
  --router "${AGENT_ROUTER}" \
  --api-url "${AGENT_REGISTRY_URL}" \
  --owner-token "${AGENT_REGISTRY_OWNER_TOKEN}" || true

while true; do
  python agent_registry_cli.py heartbeat "${AGENT_ID}" "${AGENT_HEARTBEAT_SECRET}" \
    --router "${AGENT_ROUTER}" \
    --api-url "${AGENT_REGISTRY_URL}" || true
  sleep 30
done
