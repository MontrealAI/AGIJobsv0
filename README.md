# AGIJobsv0

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)
[![HGM guardrails](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=HGM%20guardrails)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=branch%3Amain+workflow%3A%22ci+%28v2%29%22)

AGIJobsv0 is the reference implementation of the AGI Jobs platform: a suite of Ethereum smart contracts, agent orchestration
services, front-end consoles, and demo experiences for running autonomous labour markets. The repository ships the v2 contract
stack, operational tooling for owners and validators, Docker automation for one-click deployments, and a gallery of narrative
demos that showcase the platform at planetary scale.

## Highlights

- **Contract system** – Modular Solidity code in [`contracts/`](contracts/) with Foundry/Hardhat toolchains and a full migration
  history under [`migrations/`](migrations/).
- **Agent orchestration** – Python services in [`orchestrator/`](orchestrator/), the [`agent-gateway/`](agent-gateway/) telemetry
  bridge, and gRPC/Web API layers under [`services/`](services/) and [`backend/`](backend/).
- **Operator & validator apps** – Next.js/React front-ends under [`apps/`](apps/) including the Operator Console, Validator UI,
  Mission Control, Enterprise Portal, and OneBox experiences.
- **Meta API & paymaster stack** – Production-style services and Docker definitions in [`compose.yaml`](compose.yaml),
  [`deploy/`](deploy/), [`paymaster/`](paymaster/), and [`services/`](services/).
- **Extensive demos** – Seventy-four guided simulations under [`demo/`](demo/) with runnable scripts, docs, and verification
  suites that exercise the platform across economic, governance, and orchestration scenarios.

## Repository layout

| Path | Description |
| --- | --- |
| [`apps/`](apps/) | Web applications (Operator Console, Validator UI, OneBox portal, enterprise dashboards, orchestrator controls). |
| [`agent-gateway/`](agent-gateway/) | Node.js service that streams orchestrator telemetry, manages agent keys, and exposes mission APIs. |
| [`attestation/`](attestation/) | EAS helpers, receipts, and attestation scripts for AGI Jobs rewards. |
| [`backend/`](backend/) | FastAPI models, database migrations, and shared backend utilities. |
| [`compose.yaml`](compose.yaml) | One-click Docker stack for anvil + orchestrator + meta API + bridge + notifications + front-ends. |
| [`config/`](config/) & [`deployment-config/`](deployment-config/) | Canonical configuration (AGIALPHA token, network params, env templates). |
| [`contracts/`](contracts/) | Solidity contracts (v2 system, upgradeable modules, tests, mocks). |
| [`demo/`](demo/) | Narrative demos with CLI launchers, docs, and automated verifiers. |
| [`docs/`](docs/) | Operations manuals, deployment runbooks, CI guides, and policy references. |
| [`examples/`](examples/) | Minimal scripts that connect to the agent gateway and validator endpoints. |
| [`orchestrator/`](orchestrator/) | Core orchestration engine (agents, planners, scoring, workflows, simulators). |
| [`packages/`](packages/) | Shared TypeScript libraries used across apps and demos. |
| [`services/`](services/) | Supporting microservices (meta API, alpha bridge, arena, thermostat, culture graph, notifications). |
| [`simulation/`](simulation/) | Monte Carlo studies and thermodynamic incentive analyses. |
| [`storage/`](storage/) & [`reports/`](reports/) | Generated artefacts (load simulations, SBOMs, coverage, audit outputs). |

Additional documentation lives in [`internal_docs/`](internal_docs/) and [`docs/`](docs/), including the owner-control handbooks,
branch protection checklists, and production deployment guides.

## Prerequisites

- Node.js 20.18.1 (install via [`nvm`](https://github.com/nvm-sh/nvm) and run `nvm use`; the version is pinned in [`.nvmrc`](.nvmrc)).
- npm 10+
- Python 3.12 with `pip`
- Foundry (for `forge` and `anvil`) and Docker (optional for one-click stack).

Install dependencies:

```bash
# Node/TypeScript toolchain
npm ci

# Python stack (orchestrator, demos, analytics)
python -m pip install --upgrade pip
python -m pip install -r requirements-python.txt
```

## Quick start

### 1. Local Hardhat & orchestrator (manual)

```bash
# Compile contracts and generate constants
npm run build

# Start a local anvil chain in another terminal
anvil --chain-id 31337 --block-time 2

# Deploy the v2 system to the local chain
npx hardhat run --network localhost scripts/v2/deploy.ts

# Launch the meta API (FastAPI with orchestrator routers)
uvicorn services.meta_api.app.main:create_app --reload --port 8000
```

For a fuller orchestration experience, run the agent gateway (`npm run agent:gateway`) and the validator CLI (`npm run agent:validator`)
after exporting the addresses from the deployment script. Use [`docs/quick-start.md`](docs/quick-start.md) for step-by-step
commands, identity provisioning, and owner role setup.

### 2. Docker one-click environment

To boot a complete stack with Anvil, meta API, orchestrator, agent gateway, validator UI, and enterprise portal:

```bash
cp deployment-config/oneclick.env.example deployment-config/oneclick.env  # customise secrets first
docker compose up --build  # RPC_URL resolves to http://anvil:8545 inside the stack
```

The Compose file wires dependent services to `RPC_URL=http://anvil:8545`, so leave the variable unset (or explicitly target the `anvil` hostname) instead of overriding it to `localhost`.

The services exposed locally:

- `http://localhost:8545` – Anvil testnet
- `http://localhost:8000` – Meta API (FastAPI)
- `http://localhost:8080` – Orchestrator + OneBox endpoints
- `http://localhost:8090` – Agent Gateway
- `http://localhost:3000` – Validator UI (Next.js)
- `http://localhost:3001` – Enterprise Portal (Next.js)

Default environment variables, contract addresses, and OneBox relayer configuration are sourced from
[`deployment-config/oneclick.env`](deployment-config/oneclick.env).

## Demo gallery

Every demo ships with a README, scripts, and verification tooling. The table below lists the marquee scenarios and how to launch
them. All commands assume `npm ci` and the Python requirements are installed.

| Demo | Directory | Launch command | What it covers |
| --- | --- | --- | --- |
| AGI Alpha Node v0 | [`demo/AGI-Alpha-Node-v0/`](demo/AGI-Alpha-Node-v0/) | `npm run demo:agi-alpha-node` | CLI-driven agent node bootstrap, validator alignment, and mission execution loops. |
| One-Box Orchestration | [`demo/One-Box/`](demo/One-Box/) | `npm run demo:onebox:launch` | Spins up the OneBox mission runner, diagnostics suite, and governance snapshot scripts. |
| Validator Constellation v0 | [`demo/Validator-Constellation-v0/`](demo/Validator-Constellation-v0/) | `npm run demo:validator-constellation` | Multi-validator alignment, staking flows, dispute escalation, and audit report export. |
| Economic Power v0 | [`demo/Economic-Power-v0/`](demo/Economic-Power-v0/) | `npm run demo:economic-power` | Treasury dynamics, burn/fee thermodynamics, and owner program automation. |
| Era of Experience v0 | [`demo/Era-Of-Experience-v0/`](demo/Era-Of-Experience-v0/) | `npm run demo:era-of-experience` | Meta-agentic UX, cultural telemetry, and experience-market workflows. |
| AGI Governance (Alpha series) | [`demo/agi-governance/`](demo/agi-governance/) | `npm run demo:agi-governance:full` | Planetary governance orchestration with mission pipelines and verification checkpoints. |
| Meta-Agentic ALPHA AGI Jobs | [`demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/`](demo/Meta-Agentic-ALPHA-AGI-Jobs-v0/) | `npm run demo:meta-agentic-alpha` | Auto-generated labour markets with recursive agent planning and compliance proofs. |
| Trustless Economic Core v0 | [`demo/Trustless-Economic-Core-v0/`](demo/Trustless-Economic-Core-v0/) | `npm run run:trustless-core` | Hardhat-based scenario that exercises reward engine, staking exits, and slashing. |
| AGI Jobs Platform at Kardashev II Scale | [`demo/AGI-Jobs-Platform-at-Kardashev-II-Scale/`](demo/AGI-Jobs-Platform-at-Kardashev-II-Scale/) | `npm run demo:kardashev-ii:orchestrate` | Large-scale orchestration with interplanetary labour routing and treasury controls. |
| Planetary Orchestrator Fabric v0 | [`demo/Planetary-Orchestrator-Fabric-v0/`](demo/Planetary-Orchestrator-Fabric-v0/) | `npm run test:planetary-orchestrator-fabric` | Validates sovereign orchestration mesh, multi-region failovers, and telemetry heatmaps. |

The [`demo/`](demo/) root contains dozens of additional missions covering
`asi-global`, `celestial-sovereign`, `zenith-sapience` governance suites, and `meta-agentic` expansions. Each folder includes a
README that explains prerequisites, scripts to run, and verification steps. Many demos expose dedicated npm scripts – search for
`"demo:"` in [`package.json`](package.json) to discover the full catalog.

### Demo verification

Most demos ship tests that can be run individually, for example:

```bash
npm run test:agi-alpha-node
npm run test:validator-constellation
npm run test:economic-power
npm run test:era-of-experience
```

Python-heavy demos expose pytest suites under [`tests/demo/`](tests/demo/) and scenario-specific harnesses (see
[`demo/Huxley-Godel-Machine-v0/tests/`](demo/Huxley-Godel-Machine-v0/tests/)). Consult each demo's README for environment
variables, required datasets, and export paths.

## Tooling & scripts

The repository centralises operational scripts under [`scripts/`](scripts/) and `npm run` commands:

- **Owner control** – `npm run owner:dashboard`, `npm run owner:pulse`, `npm run owner:verify-control`, and related scripts under
  [`scripts/v2/`](scripts/v2/) power the owner control surface, emergency runbooks, and governance snapshots (documented in
  [`docs/OWNER_CONTROL.md`](docs/OWNER_CONTROL.md)).
- **Reward engine & thermostat** – `npm run reward-engine:report`, `npm run thermostat:update`, and thermodynamic analyses in
  [`scripts/v2/`](scripts/v2/) with supporting docs in [`docs/thermodynamic-incentives.md`](docs/thermodynamic-incentives.md).
- **Release automation** – `npm run release:manifest`, `npm run release:notes`, and verification helpers for Etherscan & SBOM
  generation (see [`docs/release-checklist.md`](docs/release-checklist.md)).
- **Security checks** – `npm run security:audit`, `npm run verify:wiring`, and the owner/validator health scripts described in
  [`docs/security`](docs/security).

## Testing & quality gates

The GitHub `ci (v2)` workflow mirrors the required local checks. Run the following before opening a pull request:

```bash
# Generate Hardhat artifacts and TypeScript constants
npm run compile

# TypeScript linting, formatting, and contract tests
npm run lint && npm run test

# OneBox + enterprise portal tests (bundle via esbuild)
npm run pretest

# Python unit & integration coverage (orchestrator, demos, services)
COVERAGE_FILE=.coverage.unit coverage run --rcfile=.coveragerc -m pytest \
  test/paymaster \
  test/tools \
  test/orchestrator \
  test/simulation
COVERAGE_FILE=.coverage.unit coverage run --rcfile=.coveragerc --append -m pytest tests
COVERAGE_FILE=.coverage.unit coverage run --rcfile=.coveragerc --append -m pytest demo/Huxley-Godel-Machine-v0/tests
COVERAGE_FILE=.coverage.integration coverage run --rcfile=.coveragerc -m pytest \
  test/routes/test_agents.py \
  test/routes/test_analytics.py \
  test/routes/test_onebox_health.py \
  test/demo \
  demo/Meta-Agentic-Program-Synthesis-v0/meta_agentic_demo/tests

# Combine coverage databases
coverage combine .coverage.unit .coverage.integration
coverage report --rcfile=.coveragerc
```

For Foundry fuzzing run `forge test` inside [`contracts/`](contracts/), and use `npm run webapp:e2e` for the Cypress accessibility
and end-to-end suite. Load simulations live under [`reports/load-sim/`](reports/load-sim/) and can be regenerated with the helper
script in [`simulation/montecarlo`](simulation/montecarlo).

Refer to [`docs/v2-ci-operations.md`](docs/v2-ci-operations.md) and [`docs/ci-v2-branch-protection-checklist.md`](docs/ci-v2-branch-protection-checklist.md)
for branch protection requirements and troubleshooting tips.

## Documentation & operations

- **Overview & architecture** – [`docs/overview.md`](docs/overview.md), [`docs/architecture-v2.md`](docs/architecture-v2.md).
- **Deployment** – [`docs/v2-deployment-and-operations.md`](docs/v2-deployment-and-operations.md),
  [`docs/deployment-production-guide.md`](docs/deployment-production-guide.md), and the address registry at
  [`docs/DEPLOYED_ADDRESSES.md`](docs/DEPLOYED_ADDRESSES.md).
- **Owner control suite** – [`docs/owner-control-handbook.md`](docs/owner-control-handbook.md) with auxiliary guides in
  [`docs/owner-control-*.md`](docs/).
- **OneBox guides** – [`docs/onebox/`](docs/onebox/) and [`docs/onebox-ux.md`](docs/onebox-ux.md) for mission launch flows.
- **Agent gateway** – [`docs/agent-gateway.md`](docs/agent-gateway.md) and examples in [`examples/agentic/`](examples/agentic/).
- **Attestation & receipts** – [`docs/attestation.md`](docs/attestation.md) and [`docs/burn-receipts.md`](docs/burn-receipts.md).

The `RUNBOOK.md`, `MIGRATION.md`, `SECURITY.md`, and `CHANGELOG.md` files at the root summarise operational history and the
migration path from legacy deployments.

## Community & contributions

1. Fork the repository and create a feature branch.
2. Run the local checks described above.
3. Submit a pull request; ensure the CI summary check is green.

See [`SECURITY.md`](SECURITY.md) for responsible disclosure, [`RUNBOOK.md`](RUNBOOK.md) for incident response procedures, and
[`docs/AGENTIC_QUICKSTART.md`](docs/AGENTIC_QUICKSTART.md) for onboarding new agent developers.

AGIJobsv0 is released under the [MIT License](LICENSE).
