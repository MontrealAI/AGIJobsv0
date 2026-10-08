#!/usr/bin/env bash
set -euo pipefail

AGENT_ID="${AGENT_ID:-agent-001}"
AGENT_REGION="${AGENT_REGION:-us-east}"
AGENT_CAPABILITIES="${AGENT_CAPABILITIES:-execution}"
AGENT_ROUTER="${AGENT_ROUTER:-default}"
AGENT_REGISTRY_URL="${AGENT_REGISTRY_URL:-http://meta-api:8000/agents}"
: "${AGENT_HEARTBEAT_SECRET:?Set a unique AGENT_HEARTBEAT_SECRET}"
: "${AGENT_REGISTRY_OWNER_TOKEN:?Set AGENT_REGISTRY_OWNER_TOKEN}"
case "$AGENT_HEARTBEAT_SECRET" in changeme|change-me|please-change-me|replace-me) echo 'Replace the example heartbeat secret' >&2; exit 1;; esac
case "$AGENT_REGISTRY_OWNER_TOKEN" in changeme|change-me|super-secret-token) echo 'Replace the example registry token' >&2; exit 1;; esac

echo "Starting AGI Jobs registry agent ${AGENT_ID} (${AGENT_REGION})"
ready=0
for attempt in $(seq 1 30); do
  if curl --connect-timeout 2 --max-time 5 -sf -H "X-Owner-Token: ${AGENT_REGISTRY_OWNER_TOKEN}" "${AGENT_REGISTRY_URL}" >/dev/null; then ready=1; break; fi
  sleep 2
done
[ "$ready" = 1 ] || { echo 'Registry did not become ready; check URL and owner credentials' >&2; exit 1; }

# argparse global flags must precede the subcommand. Registration failure must
# stop the service, rather than serving an unrelated directory as healthy.
if ! python agent_registry_cli.py --api-url "$AGENT_REGISTRY_URL" --owner-token "$AGENT_REGISTRY_OWNER_TOKEN" register \
  "$AGENT_ID" docker-operator "$AGENT_REGION" "$AGENT_CAPABILITIES" 1000 "$AGENT_HEARTBEAT_SECRET" --router "$AGENT_ROUTER"; then
  echo 'Registration was not accepted; verifying an existing registration with its heartbeat secret'
  python agent_registry_cli.py --api-url "$AGENT_REGISTRY_URL" heartbeat "$AGENT_ID" "$AGENT_HEARTBEAT_SECRET" --router "$AGENT_ROUTER"
fi

python /usr/local/bin/agent-health.py &
health_pid=$!
trap 'kill "$health_pid" 2>/dev/null || true; exit 0' TERM INT
trap 'kill "$health_pid" 2>/dev/null || true' EXIT
while true; do
  python agent_registry_cli.py --api-url "$AGENT_REGISTRY_URL" heartbeat "$AGENT_ID" "$AGENT_HEARTBEAT_SECRET" --router "$AGENT_ROUTER"
  touch /tmp/agent-last-heartbeat
  sleep 30 &
  wait $!
done
