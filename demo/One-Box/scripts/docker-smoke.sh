#!/usr/bin/env bash
set -euo pipefail
cleanup() { docker rm -f onebox-ui-test onebox-api-test >/dev/null 2>&1 || true; }
trap cleanup EXIT
# Deliberately public test strings; no production credentials or chain transactions.
docker run -d --name onebox-ui-test --read-only --cap-drop ALL --security-opt no-new-privileges -e PORT=4188 -e ONEBOX_API_TOKEN=DO_NOT_EXPOSE_TEST_TOKEN onebox-ui:test
docker run -d --name onebox-api-test -e ONEBOX_PORT=8080 -e ONEBOX_HOST=0.0.0.0 -e ONEBOX_API_TOKEN=local-test-token-1234 -e JOB_REGISTRY_ADDRESS=0x1111111111111111111111111111111111111111 -e RPC_URL=http://127.0.0.1:1 onebox-api:test node apps/orchestrator/onebox-server.js
for attempt in $(seq 1 30); do
  if docker exec onebox-api-test node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then break; fi
  if [ "$attempt" = 30 ]; then docker logs onebox-api-test; exit 1; fi
  sleep 1
done
docker exec onebox-api-test node -e "fetch('http://127.0.0.1:8080/onebox/status').then(r=>process.exit(r.status===401?0:1)).catch(()=>process.exit(1))"
docker exec onebox-ui-test node -e "(async()=>{const r=await fetch('http://127.0.0.1:4188/');const h=await r.text();if(!r.ok||!h.includes(\"connect-src 'none'\")||h.includes('DO_NOT_EXPOSE_TEST_TOKEN')||h.includes('token='))throw Error('Invalid offline UI');const asset=h.match(/src=\"([^\"]+\\.js)\"/);if(!asset||!(await fetch(new URL(asset[1],r.url))).ok)throw Error('Missing JS asset');if((await fetch('http://127.0.0.1:4188/runtime-config.json')).status!==404)throw Error('Public runtime config must not exist');})().catch(e=>{console.error(e);process.exit(1)})"
[ "$(docker inspect --format '{{.Config.User}}' onebox-ui-test)" = node ]
