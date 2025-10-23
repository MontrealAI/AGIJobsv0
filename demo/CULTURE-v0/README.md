# 🎖️ CULTURE 👁️✨ Demo

The CULTURE demo showcases how a non-technical owner can harness AGI Jobs v0 (v2) to create a self-sustaining ecosystem of cultural knowledge artifacts and autonomous self-play learning loops. This repository slice delivers a production-ready blueprint that combines on-chain artifact registries, autonomous arena orchestration, analytics, and a one-click studio experience.

## What is Included?

- **CultureRegistry.sol** — An on-chain registry for durable knowledge artifacts with lineage, citations, and owner-controlled governance.
- **SelfPlayArena.sol** — A pausable, owner-configurable coordination contract for autonomous teacher ↔ student ↔ critic tournaments.
- **Arena Orchestrator** — TypeScript service automating round lifecycles, difficulty thermostats, Elo updates, and commit–reveal integration hooks.
- **Culture Graph Indexer** — Event-driven graph service with PageRank-based influence analytics exposed via GraphQL.
- **Culture Studio UI** — React-based experience empowering a non-technical owner to create artifacts, launch arenas, and monitor progress with a single click.
- **Operational Runbook** — Clear instructions for deployment, configuration, and emergency response.
- **One-Click Compose** — Docker Compose definition wiring contracts, services, indexer, and UI for seamless local or testnet rollouts.
- **CI Pipeline** — Dedicated workflow ensuring contracts, services, and UI ship with tests, linting, and coverage.

Every component is documented, modular, and integrates with the AGI Jobs v0 (v2) platform without disturbing existing functionality.

## Getting Started

1. **Bootstrap configuration** — Copy `.env.example` to `.env`, fill in contract addresses + API keys, and validate with `npm run culture:env:check` (or `node demo/CULTURE-v0/scripts/check-env.mjs demo/CULTURE-v0/.env`).
2. **Install dependencies** — Run `npm install --legacy-peer-deps` from the repository root. The shared `.npmrc` keeps installs reproducible across packages and Docker builds.
3. **Compile contracts** — Execute `npx hardhat compile` to ensure `CultureRegistry` and `SelfPlayArena` artifacts are current.
4. **Deploy & configure**
   ```bash
   npx hardhat run demo/CULTURE-v0/scripts/deploy.culture.ts --network localhost
   npx hardhat run demo/CULTURE-v0/scripts/owner.setParams.ts --network localhost
   npx hardhat run demo/CULTURE-v0/scripts/owner.setRoles.ts --network localhost
   npx hardhat run demo/CULTURE-v0/scripts/seed.culture.ts --network localhost
   ```
   These scripts emit a deployment manifest at `config/deployments.local.json` and patch `.env` with fresh addresses.
5. **Launch the stack**
   ```bash
   docker compose -f demo/CULTURE-v0/docker-compose.yml up -d culture-chain culture-ipfs
   docker compose -f demo/CULTURE-v0/docker-compose.yml --profile setup run --rm culture-contracts
   docker compose -f demo/CULTURE-v0/docker-compose.yml up -d culture-orchestrator culture-indexer culture-studio
   ```
   Health checks ensure each service is reachable before dependants start.
6. **Run smoke tests** — `npm run culture:smoke` (or `docker compose -f demo/CULTURE-v0/docker-compose.yml --profile test up culture-smoke-tests --abort-on-container-exit --exit-code-from culture-smoke-tests`) exercises the RPC node, IPFS API, orchestrator, indexer, and UI before manual QA.
7. **Explore the studio** — Visit `http://localhost:4173` to mint artifacts, run self-play arenas, and inspect the culture graph.
8. **Generate analytics (optional)** — Produce reproducible weekly reports via `npm exec ts-node --project tsconfig.json demo/CULTURE-v0/scripts/export.weekly.ts` or `docker compose --profile reports run --rm culture-reports`.

Refer to [RUNBOOK.md](RUNBOOK.md) for production operations, owner controls, and troubleshooting guidance.

## Service Topology

| Service | Purpose | Health Check | Isolated Volumes |
| --- | --- | --- | --- |
| `culture-chain` | Anvil local Ethereum network for testing | `cast block-number` | `culture_chain_data` |
| `culture-ipfs` | Local IPFS daemon for artifact storage | `ipfs swarm peers` | `culture_ipfs_data`, `culture_ipfs_exports` |
| `culture-contracts` (profile `setup`) | One-shot deployment + seeding pipeline | exits on success | `culture_node_modules`, `culture_artifacts` |
| `culture-orchestrator` | Arena automation API & telemetry | `GET /metrics` | `culture_orchestrator_state`, `culture_orchestrator_logs` |
| `culture-indexer` | GraphQL indexer + influence analytics | `GET /healthz` | `culture_indexer_db`, `culture_indexer_logs` |
| `culture-studio` | Owner-facing UI | `GET /` | — |
| `culture-reports` (profile `reports`) | Generates weekly Markdown reports | exits on success | `culture_node_modules` |

## Resource requirements & troubleshooting

**Baseline resources**

- 4 CPU cores (or 2 performance + 2 efficiency cores) to keep the orchestrator + indexer responsive while Anvil and IPFS mine blocks.
- 8 GB RAM to accommodate Node.js services, Prisma, and IPFS caching without swapping.
- 10 GB free disk for contract artifacts, IPFS blocks, and SQLite snapshots stored in the named volumes.

**Smoke test workflow**

1. Ensure Docker Desktop (macOS/Windows) or Docker Engine (Linux) is running with the resources above allocated.
2. Execute `npm run culture:smoke` from a clean clone. The command builds all service images, boots dependencies, and waits for healthy responses before exiting.
3. If `culture-smoke-tests` fails, inspect `docker compose logs culture-smoke-tests` plus the service listed in the error message; health checks surface HTTP status codes and RPC errors for quick triage.

**Common recovery paths**

- **Docker not available** — Install Docker, or run `npm run culture:env:check` + `npx hardhat node`/`npx hardhat run ...` manually for a partial verification flow.
- **Port conflicts** — Override `ORCHESTRATOR_PORT`, `INDEXER_PORT`, and `IPFS_*` in `.env` and re-run `npm run culture:env:check` before rebuilding images.
- **Slow startups** — Increase `SMOKE_MAX_ATTEMPTS`/`SMOKE_BACKOFF_MS` when invoking `npm run culture:smoke` to accommodate low-resource laptops.
- **IPFS bootstrap failures** — Remove the `culture_ipfs_*` volumes (`docker volume rm culture_ipfs_data culture_ipfs_exports`) and re-run the compose stack to recreate a clean repo.

## Automation Scripts

- `deploy.culture.ts` — Deploys CultureRegistry & SelfPlayArena, writes manifests, and patches `.env` addresses.
- `owner.setParams.ts` — Applies arena rewards, committee sizing, success targets, and allowed artifact kinds from `config/culture.json`.
- `owner.setRoles.ts` — Grants author/teacher/student/validator roles via the identity registry and whitelists orchestrators.
- `seed.culture.ts` — Mints demo artifacts on-chain and seeds the indexer API.
- `export.weekly.ts` — Renders deterministic analytics from `data/analytics/*` into Markdown under `reports/`.

See [scripts/README.md](scripts/README.md) for additional details.

## Weekly Analytics

Run `npm exec ts-node --project tsconfig.json demo/CULTURE-v0/scripts/export.weekly.ts` (or the `culture-reports` compose profile) to regenerate `reports/culture-weekly.md` and `reports/arena-weekly.md`. The inputs live in `data/analytics/` so the reports can be audited and reproduced at any time.

## Continuous Integration

The dedicated workflow in `ci/culture-ci.yml` (mirrored under `.github/workflows/culture-ci.yml`) enforces:

- `lint`: pnpm-installed ESLint/Prettier for all TypeScript packages.
- `solidity`: Solhint linting, Foundry + Hardhat test suites, gas snapshot enforcement, bytecode budgets, and coverage ≥90% for contracts.
- `static-analysis`: Slither analysis and optional MythX scans when `MYTHX_API_KEY` is provided.
- `services`: Jest/Vitest coverage suites for the orchestrator, indexer, and Culture Studio UI (each ≥90% line coverage enforced via `nyc`/`vitest`).
- `e2e`: Cypress headless smoke tests against the Docker stack with deterministic network intercepts.

All jobs execute with Node.js 20.18.1 and `pnpm`, and they publish coverage reports as artifacts. Branch protection must require the five job names above so that regressions cannot merge unnoticed.

For local parity run:

```sh
cd demo/CULTURE-v0
make test
```

The `Makefile` target mirrors CI (lint → contracts → services → coverage → budget checks). Use `make e2e` to run the Cypress suite locally after Docker dependencies are available, and `make down` to tear the stack down.

## Repository Layout

```
contracts/                  # Solidity contracts (CultureRegistry, SelfPlayArena)
backend/arena-orchestrator/  # Round automation, APIs, difficulty/Elo engines
indexers/culture-graph-indexer/ # GraphQL indexer with influence analytics
apps/culture-studio/         # Culture Studio UI (React + Vite)
scripts/                     # Deployment, seeding, sample automation scripts
config/                      # Culture demo configuration bundle
ci/                          # CI workflows dedicated to CULTURE demo
reports/                     # Weekly analytics reports (CMS, SPG, etc.)
```

Each subdirectory ships with its own README or documentation to ensure clarity for contributors and operators.

## Status

The CULTURE demo is production-ready and fully compatible with AGI Jobs v0 (v2). Extensive unit, integration, and end-to-end testing provide confidence for high-stakes deployments.

