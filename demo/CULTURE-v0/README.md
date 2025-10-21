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

1. **Bootstrap configuration** — Copy `.env.example` to `.env` and adjust RPC URLs, private keys, and optional IPFS credentials.
2. **Install dependencies** — Run `npm install --legacy-peer-deps` from the repository root.
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
6. **Explore the studio** — Visit `http://localhost:4173` to mint artifacts, run self-play arenas, and inspect the culture graph.
7. **Generate analytics (optional)** — Produce reproducible weekly reports via `npm exec ts-node --project tsconfig.json demo/CULTURE-v0/scripts/export.weekly.ts` or `docker compose --profile reports run --rm culture-reports`.

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

The dedicated workflow in `ci/culture-ci.yml` enforces:

- Solidity linting with `solhint`, Forge unit tests, and coverage ≥90%.
- Package-level lint/tests/coverage for the arena orchestrator, graph indexer, and Culture Studio UI (Vitest with thresholds enforced).
- Cypress end-to-end smoke tests against the docker-compose stack (contracts, orchestrator, indexer, UI).

The pipeline runs on every PR and push touching `demo/CULTURE-v0/**`, blocking merges that do not meet the quality bar.

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

