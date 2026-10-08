#!/usr/bin/env bash
# Every successful probe names its actual scope; packaging is not commissioning.
set -euo pipefail
kind=${1:?image catalog name required}
image=${2:?image reference required}
name="agi-${kind}-smoke-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
start() { docker run -d --name "$name" "$@" "$image"; }
http_ready() {
  local port=$1 route=$2
  for attempt in $(seq 1 45); do
    if docker exec "$name" node -e "fetch('http://127.0.0.1:${port}${route}',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then return; fi
    if [ "$(docker inspect --format '{{.State.Running}}' "$name")" != true ]; then break; fi
    sleep 1
  done
  docker logs "$name"; return 1
}
case "$kind" in
  gateway)
    node scripts/docker/gateway-smoke.cjs "$image"
    ;;
  node-runner)
    docker run -d --name "$name" -e ONEBOX_HOST=0.0.0.0 -e ONEBOX_PORT=8080 -e ONEBOX_API_TOKEN=local-smoke-token -e JOB_REGISTRY_ADDRESS=0x1111111111111111111111111111111111111111 -e RPC_URL=http://127.0.0.1:1 "$image" node apps/orchestrator/onebox-server.js
    http_ready 8080 /healthz
    docker exec "$name" node -e "fetch('http://127.0.0.1:8080/onebox/status',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.status===401?0:1))"
    echo 'PASS: One-Box HTTP boot and unauthorized access rejection; RPC work is separately tested by e2e.'
    ;;
  validator-runner|bundler|paymaster-supervisor)
    start -e PORT=7000
    http_ready 7000 /healthz
    echo 'PASS: rehearsal adapter HTTP boot (this adapter is not a production settlement service).'
    ;;
  webapp|validator-ui)
    start
    http_ready 3000 /
    echo 'PASS: production Next.js server boots and serves the application.'
    ;;
  owner-console|culture-studio)
    start
    port=80; route=/
    if [ "$kind" = culture-studio ]; then port=4173; route=/healthz; fi
    for attempt in $(seq 1 30); do
      if docker exec "$name" wget -T 3 -q -O /dev/null "http://127.0.0.1:${port}${route}"; then break; fi
      if [ "$attempt" = 30 ]; then docker logs "$name"; exit 1; fi
      sleep 1
    done
    docker exec "$name" nginx -t
    echo 'PASS: nginx configuration and served application.'
    ;;
  notifications)
    start
    http_ready 8075 /healthz
    docker exec "$name" node -e "(async()=>{const r=await fetch('http://127.0.0.1:8075/notify',{signal:AbortSignal.timeout(2000),method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'container smoke'})});if(r.status!==202)throw Error('write');const q=await(await fetch('http://127.0.0.1:8075/notifications',{signal:AbortSignal.timeout(2000)})).json();if(!q.notifications.some(x=>x.message==='container smoke'))throw Error('read')})().catch(e=>{console.error(e);process.exit(1)})"
    echo 'PASS: notification service boot and persisted write/read.'
    ;;
  alpha-bridge)
    start
    for attempt in $(seq 1 30); do
      if docker exec "$name" node -e "const s=require('net').connect(50052,'127.0.0.1',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),2000)"; then break; fi
      if [ "$attempt" = 30 ]; then docker logs "$name"; exit 1; fi
      sleep 1
    done
    echo 'PASS: packaged gRPC definition loads and bridge listens; upstream provider commissioning remains separate.'
    ;;
  meta-api)
    start
    for attempt in $(seq 1 45); do
      if docker exec "$name" python -c "import urllib.request; assert urllib.request.urlopen('http://127.0.0.1:8000/healthz',timeout=2).status == 200"; then break; fi
      if [ "$attempt" = 45 ]; then docker logs "$name"; exit 1; fi
      sleep 1
    done
    echo 'PASS: Python API boots and answers health check.'
    ;;
  onebox-ui)
    start --read-only --cap-drop ALL --security-opt no-new-privileges
    http_ready 4173 /
    echo 'PASS: offline One-Box UI with read-only filesystem.'
    ;;
  agent-node)
    docker run --rm --entrypoint python "$image" agent_registry_cli.py --help
    echo 'PASS: agent registration CLI and Python imports; registry commissioning required.'
    ;;
  operator)
    docker run --rm --entrypoint node "$image" --check apps/operator/dist/telemetry.js
    echo 'PASS: operator telemetry entry point packaged; oracle credentials required for commissioning.'
    ;;
  alpha-python|alpha-typescript|alpha-commandhub)
    docker run --rm "$image" --help
    echo 'PASS: historical demo CLI entry point and imports.'
    ;;
  alpha-grandiose)
    docker run --rm --entrypoint python "$image" -m agi_alpha_node_demo.cli --help
    echo 'PASS: historical grandiose demo CLI entry point and imports.'
    ;;
  alpha-grand)
    docker run --rm --entrypoint python "$image" -c 'from alpha_node.web.app import app; assert app is not None'
    echo 'PASS: historical grand demo application imports.'
    ;;
  culture-indexer|culture-demo-indexer)
    docker run --rm --entrypoint node "$image" --check dist/index.js
    docker run --rm --entrypoint python3 "$image" -c 'import networkx as nx; assert abs(sum(nx.pagerank(nx.path_graph(3)).values()) - 1) < 1e-8'
    echo 'PASS: indexer entry point and graph computation dependencies; chain/database integration is a separate CULTURE gate.'
    ;;
  culture-orchestrator)
    docker run --rm --entrypoint node "$image" --check dist/index.js
    echo 'PASS: CULTURE orchestrator runtime entry point; configured chain integration is a separate gate.'
    ;;
  culture-smoke-tests)
    docker run --rm --entrypoint node "$image" --check smoke-test.mjs
    echo 'PASS: CULTURE integration probe is packaged; it requires the running CULTURE stack.'
    ;;
  *) echo "Unknown container catalog entry: $kind" >&2; exit 1 ;;
esac
