# Container operations and verification

The container catalog in [`scripts/docker/container-catalog.json`](../scripts/docker/container-catalog.json) covers all 24 Dockerfiles. The inventory check also validates all nine Compose files against the build contexts that CI actually uses. Historical demos remain available; their checks state whether they prove an HTTP service, a command-line entry point, or only the packaged integration dependencies.

## Choose the appropriate stack

| Stack | Command / purpose | Required setup |
| --- | --- | --- |
| Offline One-Box | `docker compose -f demo/One-Box/docker-compose.yaml up --build` | No wallet or production credentials. Browser UI on `http://localhost:4173`. |
| Connected One-Box | Follow [One-Box](../demo/One-Box/README.md), then enable `--profile connected` | Local contracts, relayer configuration and browser-reachable API URL. |
| Root deployment stack | `docker compose --env-file deployment-config/oneclick.env up --build` | Reviewed deployment addresses, a commissioned keystore, unique API tokens, and the matching token metadata. |
| Rehearsal adapters | Add `--profile rehearsal` to the root stack command | Bundler, paymaster supervisor and attester in this stack are mocks. They do not provide live settlement. |
| CULTURE | Follow [CULTURE](../demo/CULTURE-v0/README.md) | Local chain/bootstrap, database, IPFS and authenticated orchestrator configuration. |
| Registry agent | `docker compose -f deployment-config/agent-node.compose.yaml up --build` | Reachable `AGENT_REGISTRY_URL`, owner token and unique heartbeat secret. This is a registry/heartbeat agent, not a commissioned computer-use worker. |

The root stack binds published ports to loopback. Its gateway listens on port 8090, and the orchestrator runs the One-Box HTTP server on port 8080. The gateway stores its compiled-runtime state in the `gateway_storage` volume; validation commitments must survive container recreation. Back up this volume before upgrades. Older deployments that wrote state into an unmounted container directory require a deliberate state migration before replacement; do not discard those containers or their reveal secrets.

The generated environment supplies both `JOB_REGISTRY` and `JOB_REGISTRY_ADDRESS`. The gateway accepts the validated nonzero `AGIALPHA_TOKEN` deployment address and still checks the token's name, symbol and decimals against its configuration on chain. Set `KEYSTORE_URL` and `KEYSTORE_TOKEN` for the real internal keystore; the template intentionally does not contain a working production credential. Deployed addresses alone do not commission wallets, workers or independent reviewers.

## Browser configuration

`NEXT_PUBLIC_*` values are built into Next.js browser assets. The validator and enterprise Dockerfiles take their public settings as build arguments, and root Compose passes the corresponding environment values into the build. Run the command with `--env-file deployment-config/oneclick.env`; editing a service's runtime environment alone will not change an existing browser bundle.

The validator server uses the internal `GATEWAY_URL=http://agent-gateway:8090` for its read-only same-origin jobs proxy. This private service URL is separate from browser RPC settings.

Use URLs reachable from the browser, such as `http://localhost:8545` and `http://localhost:8090`, rather than Docker-internal hostnames. Rebuild the UI image after changing an address or public URL. Never put private keys, keystore tokens or API secrets in `NEXT_PUBLIC_*` variables. Token and contract metadata must match the selected network.

## What CI proves

The five published images retain the required `containers / build (image)` check names. Each required check depends on successful native AMD64 **and** native ARM64 builds, runtime probes and OS vulnerability scans. ARM64 runs on GitHub's `ubuntu-24.04-arm` runner, avoiding the observed QEMU illegal-instruction failure during the webapp dependency installation. A failed, cancelled or skipped native job makes the required checks fail. The same required checks also require the complete inventory and auxiliary image matrix to pass, so an unbuilt historical image cannot silently disappear from coverage.

On main and release tags, CI publishes architecture-specific candidates with provenance and SBOMs, verifies their image identity against the executed images, and combines their digests. Main's `latest` tag advances only after these checks succeed. Release digest artifact names remain unchanged.

| Probe | Evidence produced |
| --- | --- |
| Gateway | Positive boot against isolated local Hardhat token/registry/validation fixtures and an ephemeral local keystore; token metadata check, wallet load, HTTP and gRPC listeners, non-root process, a durable validation record across container recreation, and graceful shutdown. No external worker or paid settlement is implied. |
| Node runner / One-Box | HTTP health and rejection of an unauthenticated API request. Contract lifecycle behavior is covered separately by the end-to-end tests. |
| Enterprise / validator UIs | Production Next.js server boots and serves the application. Browser voting and wallet integration have their own tests. |
| Owner console / CULTURE studio | Nginx configuration and a served application/health endpoint. |
| Notification service | HTTP boot plus write/read of a stored notification. |
| Alpha bridge / meta API | Listening gRPC service with packaged protocol definition / Python HTTP health. Upstream integrations require separate commissioning. |
| Historical and configured integrations | Every Dockerfile builds; the corresponding CLI, entry point or graph dependency probe runs. An entry-point check is explicitly not evidence of a commissioned chain, database, oracle or external agent. |

Application dependency findings are handled by the separate release dependency gate. Container success does not waive that gate, an independent security review, deployment signing requirements, or the live commissioning work in [production readiness](production/readiness.md).

To reproduce an image probe locally after building its catalog tag:

```bash
python3 -m pip install PyYAML==6.0.3
python3 scripts/docker/validate-catalog.py
bash scripts/docker/container-smoke.sh webapp agi-smoke:webapp
```

The gateway probe additionally needs the pinned root Node/npm toolchain, installed locked dependencies, and `npx hardhat compile`. It launches an isolated chain itself. It does not use production keys.
