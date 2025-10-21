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

1. Copy `.env.example` to `.env` and fill in the required variables (RPC URLs, deployer key, IPFS credentials, etc.).
2. Run `docker compose up` from this directory to launch a fully wired local stack.
3. Visit the Culture Studio UI to mint artifacts, launch arenas, and explore the Culture Graph.

Refer to [RUNBOOK.md](RUNBOOK.md) for production operations, owner controls, and troubleshooting guidance.

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

