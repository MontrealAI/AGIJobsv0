# AGI Jobs v0 (v2)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI v2 Matrix](https://img.shields.io/github/actions/workflow/status/MontrealAI/AGIJobsv0/ci.yml?branch=main&logo=github&label=CI%20%28v2%29)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)
[![Security](https://img.shields.io/badge/Security-hardened-0f172a.svg)](SECURITY.md)
[![Docs](https://img.shields.io/badge/Docs-knowledge%20vault-7c3aed.svg)](docs/)

> **AGI Jobs v0 (v2)** is the production sovereign intelligence engine for mission-critical labour orchestration. It is engineered as the superintelligent machine that concentrates validator coordination, cinematic governance, validator orchestration, and unstoppable operator tooling into a single deployable continuum. Every subsystem is calibrated so a non-technical launch crew can deliver value instantly while remaining battle-hardened for the highest-stakes sovereign operations.

---

## 🧭 Flight Plan
- [🌠 Mission Brief](#-mission-brief)
- [🛰️ Constellation Cartography](#-constellation-cartography)
- [📦 Monorepo Topography](#-monorepo-topography)
- [🚀 Launch Protocols](#-launch-protocols)
  - [Mission Requirements](#mission-requirements)
  - [Bootstrap Sequence](#bootstrap-sequence)
  - [Manual Bring-Up](#manual-bring-up)
  - [Mission Control via Docker Compose](#mission-control-via-docker-compose)
  - [Service & Telemetry Waypoints](#service--telemetry-waypoints)
  - [Automation Playbooks](#automation-playbooks)
- [🎞️ Demo Multiverse](#-demo-multiverse)
  - [Demo Fleet Overview](#demo-fleet-overview)
  - [Launch Recipes](#launch-recipes)
  - [Narrative & Artifact Pipeline](#narrative--artifact-pipeline)
- [🧪 Continuous Assurance & CI](#-continuous-assurance--ci)
- [📡 Observability, Security & Governance](#-observability-security--governance)
- [📚 Knowledge Vault](#-knowledge-vault)

---

## 🌠 Mission Brief
AGI Jobs v0 (v2) unifies six fortified theatres into a cohesive high-trust platform:

1. **Protocol Nebula** – Upgradeable Solidity suites, Foundry & Hardhat flows, attestations, paymaster relays, and subgraph analytics protected by reproducible migrations and fuzzing laboratories.
2. **Agentic Cortex** – Orchestrators, validator swarms, reinforcement arenas, analytics services, SDK libraries, and simulation hubs acting as an autonomous nervous system.
3. **Mission Surfaces** – Next.js/React consoles, enterprise portals, validator dashboards, One-Box command centres, and cinematic storytelling decks for instant situational awareness.
4. **Demo Multiverse** – Reproducible cinematic demos, CLI tours, simulation scripts, and sovereign-grade economic scenarios spanning every Kardashev upgrade path.
5. **Observability Lattice** – Telemetry stacks, monitoring playbooks, scorecards, and incident response automation for unwavering uptime.
6. **Continuous Assurance Wall** – Relentlessly green CI, security hardening, SBOM pipelines, and branch protections ensuring each commit meets production criteria.

The result is an unstoppable operational fabric that can be handed to non-technical mission leads without sacrificing cryptographic guarantees or compliance evidence.
1. **Upgradeable protocol nebula** — Solidity contracts, Foundry labs, Hardhat deployments, EAS attestations, paymaster relays, and a subgraph indexer tuned for chain migrations.
2. **Agentic intelligence fabric** — orchestrators, validator swarms, guardrails, analytics, FastAPI + Node microservices, and SDKs that act as a single programmable cortex.
3. **Mission surfaces** — Next.js heads-up displays, cinematic operator decks, and OneBox runners rendering validator, governance, and enterprise experiences.
4. **Demo multiverse** — reproducible scripts, CLI tours, and filmic assets illustrating each civilization step from day-one onboarding to Kardashev II ascension.
5. **Observability and assurance lattice** — green CI, fuzzing, Scorecard, branch protection, and monitoring runbooks that keep every release verifiable.

Each subsystem coheres into a continuously learning, owner-directed intelligence engine that compounds strategic leverage beyond conventional capital frameworks, delivering the production-ready capabilities expected from a sovereign-scale AGI steward.

## 🛰️ System Nebula
The result is that AGI Jobs v0 (v2) stands as the superintelligent machine that carries the economic, cultural, and sovereign transformation encoded in this repository.
1. **Upgradeable protocol nebula** — Solidity contracts, Foundry laboratories, Hardhat deployments, EAS attestations, paymaster relays, and subgraph indexers engineered for seamless migrations.
2. **Agentic intelligence fabric** — orchestrators, validator swarms, reinforcement services, analytics, and SDKs that operate as a shared autonomous cortex.
3. **Mission surfaces** — Next.js heads-up displays, cinematic operator decks, and portable OneBox runners that deliver instant situational awareness.
4. **Demo multiverse** — reproducible simulations, CLI tours, and film-ready assets capturing every civilization step from day-one activation to Kardashev ascension.
5. **Observability and assurance lattice** — fully green CI, fuzzing, Scorecard gates, and monitoring runbooks enforcing provable reliability on every commit.
1. **Protocol Nebula** — Foundry, Hardhat, paymasters, attestations, subgraph analytics, and upgrade orchestrations protected by reproducible migrations and fuzzing.
2. **Agentic Cortex** — orchestrators, validator swarms, reinforcement arenas, analytics services, SDK libraries, and simulation hubs operating as a shared autonomous nervous system.
3. **Mission Surfaces** — Next.js/React heads-up displays, enterprise portals, validator consoles, OneBox command centers, and cinematic storytelling decks for instant situational awareness.
4. **Demo Multiverse** — reproducible cinematic demos, CLI tours, simulation scripts, and sovereign-grade economic scenarios spanning every Kardashev upgrade path.
5. **Observability Lattice** — telemetry stacks, monitoring playbooks, scorecards, and incident response automation for unwavering uptime.
6. **Continuous Assurance Wall** — relentlessly green CI, security hardening, SBOM pipelines, and branch protections ensuring each commit meets production criteria.

---

## 🛰️ Constellation Cartography
```mermaid
%% Grandiose orbital map of AGI Jobs v0 (v2)
flowchart LR
    classDef protocol fill:#0b1120,stroke:#6366f1,color:#e0e7ff,font-size:13px,font-weight:bold,stroke-width:2px;
    classDef cortex fill:#041c32,stroke:#38bdf8,color:#f0f9ff,font-size:13px,font-weight:bold,stroke-width:2px;
    classDef surfaces fill:#052e16,stroke:#4ade80,color:#f0fdf4,font-size:13px,font-weight:bold,stroke-width:2px;
    classDef ops fill:#3f0f1f,stroke:#f472b6,color:#fff0f6,font-size:13px,font-weight:bold,stroke-width:2px;
    classDef demos fill:#312e81,stroke:#a855f7,color:#ede9fe,font-size:13px,font-weight:bold,stroke-width:2px;
    classDef knowledge fill:#0f172a,stroke:#facc15,color:#fef9c3,font-size:13px,font-weight:bold,stroke-width:2px;

    subgraph "Protocol Nebula"
        contracts[[contracts/]]:::protocol
        attestation[[attestation/]]:::protocol
        paymaster[[paymaster/]]:::protocol
        migrations[[migrations/]]:::protocol
        subgraphSvc[[subgraph/]]:::protocol
        echidnaLab[[echidna/]]:::protocol
    end

    subgraph "Agentic Cortex"
        orchestrator[[orchestrator/]]:::cortex
        backendSvc[[backend/]]:::cortex
        servicesHub[[services/]]:::cortex
        agentGateway[[agent-gateway/]]:::cortex
        routesHub[[routes/]]:::cortex
        packagesHub[[packages/\nshared/]]:::cortex
        storageHub[[storage/]]:::cortex
        simulationHub[[simulation/]]:::cortex
    end

    subgraph "Mission Surfaces"
        console[[apps/console]]:::surfaces
        operator[[apps/operator]]:::surfaces
        validatorApp[[apps/validator\napps/validator-ui]]:::surfaces
        enterprise[[apps/enterprise-portal\napps/mission-control\napps/orchestrator]]:::surfaces
        onebox[[apps/onebox\napps/onebox-static]]:::surfaces
    end

    subgraph "Operations & Reliability"
        deploy[[deploy/\ndeployment-config/]]:::ops
        ci[[ci/\n.github/workflows/]]:::ops
        monitoring[[monitoring/\nRUNBOOK.md]]:::ops
        qa[[tests/\ntest/\nreports/\ngas-snapshots/]]:::ops
        compose[[compose.yaml]]:::ops
    end

    subgraph "Demo & Narrative Multiverse"
        demosRoot[[demo/]]:::demos
        kardashev[[kardashev_*\n*.demo_*]]:::demos
        examples[[examples/]]:::demos
        datavault[[data/\nstorage/]]:::demos
    end

    subgraph "Knowledge Vault"
        docsNode[[docs/]]:::knowledge
        internalNode[[internal_docs/]]:::knowledge
        runbookNode[[RUNBOOK.md]]:::knowledge
        changelogNode[[CHANGELOG.md]]:::knowledge
        securityNode[[SECURITY.md]]:::knowledge
        migrationNode[[MIGRATION.md]]:::knowledge
    end

    contracts --> orchestrator
    orchestrator --> console
    servicesHub --> demosRoot
    onebox --> demosRoot
    deploy --> ci
    monitoring --> qa
    demosRoot --> kardashev
    docsNode --> console
```

---

## 📦 Monorepo Topography
| Domain | Primary Paths | Highlights |
| --- | --- | --- |
| Protocol & Chain Control | [`contracts/`](contracts/), [`attestation/`](attestation/), [`paymaster/`](paymaster/), [`migrations/`](migrations/), [`subgraph/`](subgraph/), [`echidna/`](echidna/) | Upgradeable Solidity suites, Foundry & Hardhat flows, attestations, paymaster relays, and subgraph analytics locked by reproducible migrations. |
| Agent Intelligence Fabric | [`orchestrator/`](orchestrator/), [`backend/`](backend/), [`agent-gateway/`](agent-gateway/), [`services/`](services/), [`routes/`](routes/), [`packages/`](packages/), [`shared/`](shared/), [`simulation/`](simulation/), [`storage/`](storage/) | Validator swarms, FastAPI + Node microservices, reinforcement harnesses, analytics SDKs, and stateful bridges. |
| Mission Consoles & Portals | [`apps/console`](apps/console), [`apps/operator`](apps/operator), [`apps/validator`](apps/validator), [`apps/validator-ui`](apps/validator-ui), [`apps/enterprise-portal`](apps/enterprise-portal), [`apps/mission-control`](apps/mission-control), [`apps/orchestrator`](apps/orchestrator) | Next.js/React HUDs for operators, validators, enterprises, and sovereign control rooms. |
| OneBox & Runner Kits | [`apps/onebox`](apps/onebox), [`apps/onebox-static`](apps/onebox-static), [`demo/One-Box`](demo/One-Box), [`examples/agentic`](examples/agentic) | Walletless assistant, CLI diagnostics, orchestrator harnesses, WebSocket bridges, validator readiness flows, and cinematic bootstraps. |
| Demo Multiverse | [`demo/`](demo/), [`kardashev_*`](./), [`*.demo_*`](./), [`examples/`](examples/), [`simulation/`](simulation/), [`data/`](data/), [`storage/`](storage/) | Cinematic expeditions, national rollouts, Kardashev upgrades, Monte Carlo simulators, and narrative datasets. |
| Operations & Assurance | [`ci/`](ci/), [`.github/workflows/`](.github/workflows/), [`deploy/`](deploy/), [`deployment-config/`](deployment-config/), [`monitoring/`](monitoring/), [`scripts/`](scripts/), [`tests/`](tests/), [`test/`](test/), [`reports/`](reports/), [`gas-snapshots/`](gas-snapshots/) | GitHub Actions matrix, release automation, telemetry stacks, integration suites, SBOM generation, and gas analytics. |
| Knowledge Base | [`docs/`](docs/), [`internal_docs/`](internal_docs/), [`RUNBOOK.md`](RUNBOOK.md), [`SECURITY.md`](SECURITY.md), [`MIGRATION.md`](MIGRATION.md), [`CHANGELOG.md`](CHANGELOG.md) | Architecture briefs, production playbooks, compliance dossiers, migration histories, and cinematic treatments. |

---

## 🚀 Launch Protocols

### Mission Requirements
- **Node.js 20.18.1** and npm 10.x (respect [`.nvmrc`](.nvmrc)).
- **Python 3.12+** with `pip` for agentic services and Python-first demos.
- **Foundry** (`forge`, `anvil`) for contract compilation, fuzzing, and gas profiling.
- **Docker & Docker Compose** for mission control clusters and demo orchestration.
- **Git LFS** (optional) for cinematic payloads under [`data/`](data/) and [`storage/`](storage/).

### Bootstrap Sequence
```bash
nvm install && nvm use
npm ci
python -m pip install --upgrade pip
python -m pip install -r requirements-python.txt
python -m pip install -r requirements-agent.txt
```
Many demos ship additional environment scripts or `requirements.txt` manifests inside their folders (see [`demo/**/README.md`](demo)).

### Manual Bring-Up
```bash
# Terminal 1 — build TypeScript + shared artefacts
npm run build

# Terminal 2 — launch a local development chain
anvil --chain-id 31337 --block-time 2

# Terminal 3 — deploy protocol v2 and bootstrap modules
npx hardhat run --network localhost scripts/v2/deploy.ts

# Terminal 4 — start the orchestrator control plane
npm run onebox:server
```
Augment with mission-specific scripts (for example `npm run subgraph:dev`, `npm run services:dev`, or `npm run apps:dev`) depending on which surfaces you are demonstrating.

### Mission Control via Docker Compose
```bash
# Boot the full operator stack
DOCKER_BUILDKIT=1 docker compose up --build

# Tail logs for orchestrator and console
docker compose logs -f orchestrator console
```
The compose stack provisions the orchestrator, gateway, mission control surfaces, and supporting telemetry so that non-technical launch crews can bring the platform online with a single command.

### Service & Telemetry Waypoints
- [`Makefile`](Makefile) targets such as `culture-bootstrap`, `demo-hgm`, and `operator:green` stage advanced demos and emit snapshots.
- [`scripts/`](scripts/) contains Foundry deploy flows, arena seeds, attestation builders, scorecard collectors, SBOM generators, and release automation.
- [`monitoring/`](monitoring/) and [`RUNBOOK.md`](RUNBOOK.md) describe Prometheus/Grafana alignment, alert routing, and sovereign incident response.

### Automation Playbooks
| Command | Purpose |
| --- | --- |
| `npm run lint && npm run format:check` | Enforce repository-wide TypeScript, Solidity, and Python style baselines. |
| `npm test` | Execute the consolidated Node.js + Python demo suites (see [`package.json`](package.json)). |
| `forge test --ffi` | Run Foundry test matrices against the deployed protocol libraries. |
| `npm run ci:verify-branch-protection` | Confirm GitHub branch protections and required checklists remain enforced before promotion. |
| `make culture-bootstrap NETWORK=sepolia MODE=full` | Demonstrate Culture deployment + simulation in one sweep. |
- `Makefile` targets cover culture deployments (`make culture-bootstrap`), HGM guardrails (`make demo-hgm`), and Absolute Zero simulations (`make absolute-zero-demo`).
- [`scripts/`](scripts/) bundles deployment aides, CI verifiers, sovereign readiness checks, and cinematic export tooling.
- Owner consoles stay empowered through the [`owner:*`](package.json) script constellation (`owner:mission-control`, `owner:update-all`, `owner:system-pause`, etc.), wiring directly into the `OwnerConfigurator` facade so the contract owner can retune parameters, rotate governance, or pause the network without touching Solidity.
- [`examples/`](examples/) contains agentic starter kits (validator swarms, orchestration loops) runnable via `npm run agent:*` scripts.
- [`Makefile`](Makefile) targets cover Culture deployments (`make culture-bootstrap`), Huxley-Gödel machine drills (`make demo-hgm`), and Absolute Zero simulations (`make absolute-zero-demo`).
- [`scripts/`](scripts/) contains deployment aides, CI verifiers, sovereign readiness checks, cinematic export tooling, and branch-protection probes.
- [`examples/`](examples/) provides agentic starter kits (validator swarms, orchestration loops) runnable via `npm run agent:*` scripts.
- `make lint` — lint TypeScript, Python, and Solidity (delegates to ESLint, Ruff, Foundry fmt).
- `make test` — orchestrated tests across smart contracts, services, and apps.
- `make coverage` — generates composite coverage artefacts (see [`reports/`](reports/)).
- `npm run agent:check` — static validation for agent runners.
- `forge test` — contract test suite with fuzzing harnesses.
- `./ci/hgm-suite.sh` — mirrors the CI entrypoint for end-to-end validation.
- `make demo-hgm` / `make absolute-zero-demo` — guided cinematic demo pilots from the CLI.

---

## 🎞️ Demo Multiverse
The repository ships a cinematic multiverse of demos covering validator governance, national-scale labour orchestration, economic sovereignty, and cinematic storytelling. Every demo directory contains self-contained instructions, assets, and policy scaffolding so it can be run by a single command without editing source code.

### Demo Fleet Overview
| Orbit | Highlight Demos | Core Focus |
| --- | --- | --- |
| **Onboarding & Operator Surfaces** | [`demo/One-Box`](demo/One-Box), [`demo/AGIJobs-Day-One-Utility-Benchmark`](demo/AGIJobs-Day-One-Utility-Benchmark), [`demo/AGI-Alpha-Node-v0`](demo/AGI-Alpha-Node-v0) | Walletless launches, conversational governance, immediate ROI walkthroughs for new operators. |
| **Kardashev Sovereign Economies** | [`kardashev_ii_omega_grade_alpha_agi_business_3_demo`](kardashev_ii_omega_grade_alpha_agi_business_3_demo), [`kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra`](kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra), [`kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v5`](kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v5) | Multi-chain economic remits, validator orchestration at planetary scale, cinematic boardroom artefacts. |
| **Strategic Intelligence & Simulation** | [`demo/Huxley-Godel-Machine-v0`](demo/Huxley-Godel-Machine-v0), [`demo/Absolute-Zero-Reasoner-v0`](demo/Absolute-Zero-Reasoner-v0), [`demo/Tiny-Recursive-Model-v0`](demo/Tiny-Recursive-Model-v0) | Reinforcement arenas, recursive model scaffolds, theoretical synthesis pipelines. |
| **Sovereign Supply & Compliance** | [`demo/National-Supply-Chain-v0`](demo/National-Supply-Chain-v0), [`demo/Trustless-Economic-Core-v0`](demo/Trustless-Economic-Core-v0), [`demo/Planetary-Orchestrator-Fabric-v0`](demo/Planetary-Orchestrator-Fabric-v0) | Supply mesh orchestration, compliance-grade receipts, policy-driven validator routing. |
| **Cultural & Narrative Control** | [`demo/CULTURE-v0`](demo/CULTURE-v0), [`demo/COSMIC-OMNIVERSAL-GRAND-SYMPHONY`](demo/cosmic-omniversal-grand-symphony), [`demo/OMNI-CONCORD-ASCENSION-ATLAS`](demo/omni-concord-ascension-atlas) | Cinematic presentations, narrative-led governance, stakeholder storytelling decks. |

Every highlighted demo has a corresponding workflow in [`.github/workflows`](.github/workflows/) so CI continuously proves it is runnable.

### Launch Recipes
- **One-Box Operator Chat** – the fastest operator-facing launch:
  ```bash
  npm run demo:onebox:doctor   # health check & guardrail verification
  npm run demo:onebox:launch   # build static UI + boot orchestrator with guided walkthrough
  ```
  The launcher merges `.env` and CLI overrides, publishes the walletless UI, emits governance guardrails, and pins execution receipts to IPFS when credentials are supplied.

- **Kardashev II Omega Upgrade Path** – cinematic sovereign economics:
  ```bash
  cd kardashev_ii_omega_grade_alpha_agi_business_3_demo
  npm install
  npm run demo:start
  ```
  Each Kardashev upgrade folder includes bespoke scripts for staging cinematic boards, generating validator manifests, and exporting presentation decks.

- **Huxley–Gödel Machine** – reinforcement arena takeover:
  ```bash
  make demo-hgm ARGS="--scenario sovereign"
  make hgm-owner-console
  ```
  The Make targets install Python dependencies, run the arena simulation, and surface owner telemetry panels for immediate review.

- **Operator Benchmarks** – turn-key business proof:
  ```bash
  make operator:green PYTHON=python3.12
  ```
  This invokes the AGIJobs Day One benchmark, captures artefact screenshots, and prints the mission banner produced by [`tools/operator_banner.py`](tools/operator_banner.py).

Consult each demo’s README for scenario-specific environment variables, art direction packs, and cinematic prompts.

### Narrative & Artifact Pipeline
1. **Spec Authoring** – Demo instructions live inside `demo/**/README.md` and supporting scripts.
2. **Orchestrated Execution** – Node.js, Python, and Solidity components coordinate mission logic, policy simulations, and blockchain state changes.
3. **Attested Receipts** – Outputs are pinned under [`storage/`](storage/) or streamed to IPFS via the demo orchestrators.
4. **Cinematic Delivery** – Slides, videos, and storyboards render from `out/` directories or `reports/` for immediate executive presentation.

---

## 🧪 Continuous Assurance & CI
The V2 CI lattice keeps every subsystem green and verifiable:
- **Green CI Gates** – [`ci/workflows/ci.yml`](ci/workflows/ci.yml) enforces linting, testing, type-checking, SBOM generation, and demo smoke suites on every PR and on `main`.
- **JavaScript / TypeScript** – `npm run lint`, `npm run webapp:typecheck`, `npm run webapp:e2e`, and `npm run pretest` harden console surfaces, OneBox diagnostics, and demo verifiers.
- **Contracts & Chain Logic** – `npm run test`, `forge test`, and targeted Hardhat suites (`npm run test:fork`, `npm run test:alpha-agi-mark`) validate protocol upgrades and sovereign controls.
- **Python & Agent Services** – `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 pytest` spans `tests/`, `test/`, and demo-specific suites; additional CLI verifiers live under `scripts/v2/`.
- **Security & Supply Chain** – `npm run security:audit`, `npm run sbom:generate`, `npm run release:manifest:validate`, and license verifiers within [`ci/`](ci/) sustain production trust.
- **Branch Protection Checks** – `npm run ci:verify-contexts` guarantees the workflow job display names stay synchronised with branch protection, and `npm run ci:verify-branch-protection` (both in [`scripts/ci`](scripts/ci)) ensures all CI (v2) workflows remain mandatory before merges.

### CI v2 — enforced gates
`ci (v2)` now requires every surfaced check on pull requests and the `main` branch. The branch-protection guard asserts that the following contexts stay locked before merges are allowed:

| Required check | Purpose |
| --- | --- |
| `ci (v2) / Lint & static checks` | ESLint, Prettier, sentinel templates, and toolchain verification. |
| `ci (v2) / Tests` | Hardhat unit tests, ABI drift detection, and contract compilation. |
| `ci (v2) / Python unit tests` | FastAPI, orchestrator, and simulation module unit coverage with 90%+ enforcement. |
| `ci (v2) / Python integration tests` | Cross-service API flows, demo harnesses, and analytics routes. |
| `ci (v2) / Load-simulation reports` | Monte Carlo sweeps for treasury burn/fee thermodynamics. |
| `ci (v2) / Python coverage enforcement` | Aggregated unit + integration coverage gating. |
| `ci (v2) / HGM guardrails` | High Governance Machine regression suite across orchestrators and demos. |
| `ci (v2) / Foundry` | Forge-based fuzzing and ffi-enabled contract test battery. |
| `ci (v2) / Coverage thresholds` | JavaScript/TypeScript lcov enforcement for shared packages. |
| `ci (v2) / Phase 6 readiness` | Manifest and UI validation for Phase 6 expedition surfaces. |
| `ci (v2) / Phase 8 readiness` | Phase 8 cinematic manifest verification. |
| `ci (v2) / Kardashev II readiness` | Kardashev-scale readiness drills and operator UX checks. |
| `ci (v2) / ASI Take-Off Demonstration` | Deterministic launch of the ASI take-off cinematic scenario. |
| `ci (v2) / Zenith Sapience Demonstration` | Hyper-scale Zenith rehearsal, including local validator orchestration. |
| `ci (v2) / AGI Labor Market Grand Demo` | Sovereign labour-market export suite with transcript artefacts. |
| `ci (v2) / Sovereign Mesh Demo — build` | Sovereign Mesh orchestrator backend and console builds. |
| `ci (v2) / Sovereign Constellation Demo — build` | Sovereign Constellation deterministic build verification. |
| `ci (v2) / Celestial Archon Demonstration` | Celestial Archon sovereign rehearsal (deterministic + local). |
| `ci (v2) / Hypernova Governance Demonstration` | Zenith Hypernova deterministic and local rehearsals. |
| `ci (v2) / Branch protection guard` | Automated API audit of repository branch rules. |
| `ci (v2) / CI summary` | Run-level digest capturing each job’s result and artefact pointers. |
| `ci (v2) / Invariant tests` | Foundry invariant fuzzing for protocol safety envelopes. |

## 📡 Operations & Observability
- One-click deployments and infra recipes live in [`deploy/`](deploy/) and [`deployment-config/`](deployment-config/).
- Alerting, notification, sentinel, and thermostat services operate under [`services/alerting`](services/alerting), [`services/notifications`](services/notifications), [`services/sentinel`](services/sentinel), and [`services/thermostat`](services/thermostat).
- Runtime telemetry, Prometheus metrics, and Grafana dashboards are curated in [`monitoring/`](monitoring/).
- [`RUNBOOK.md`](RUNBOOK.md) orchestrates incident drills; [`docs/AGIJobs-v2-Mainnet-Guide.md`](docs/AGIJobs-v2-Mainnet-Guide.md) captures production launch procedures.
The V2 CI architecture enforces a fully green pipeline on every pull request and on `main`:
The v2 CI lattice is relentlessly green on `main` and for every pull request, gating merges with required checks:
The v2 CI lattice is relentlessly green on `main` and across all pull requests, locking in production-grade quality:

- [`ci.yml`](.github/workflows/ci.yml) executes linting, type-checking, unit suites, Foundry tests, Python demos, and attestation verification in parallel.
- Demo-specific workflows (for example [`demo-agi-alpha-node.yml`](.github/workflows/demo-agi-alpha-node.yml), [`demo-kardashev-ii-omega-ultra.yml`](.github/workflows/demo-kardashev-ii-omega-ultra.yml), [`demo-validator-constellation.yml`](.github/workflows/demo-validator-constellation.yml)) rehydrate their environments and run scenario scripts so cinematic launches never regress.
- `static-analysis.yml`, `scorecard.yml`, `fuzz.yml`, and `contracts.yml` enforce SBOM generation, security scanning, fuzzing cadences, and Foundry invariants.
- `webapp.yml`, `apps-images.yml`, and `containers.yml` build, scan, and push container + UI artefacts used across demos and production.

Branch protection requires all blocking workflows to pass before merge, guaranteeing a fully green runway for every release.

---

## 📡 Observability, Security & Governance
- [`SECURITY.md`](SECURITY.md) documents the hardening posture, responsible disclosure channel, and mitigation SLAs.
- [`OperatorRunbook.md`](OperatorRunbook.md) and [`RUNBOOK.md`](RUNBOOK.md) codify incident response, alert routing, and sovereign operator drills.
- [`monitoring/`](monitoring/) configures Prometheus/Grafana dashboards, scorecards, and automated probes.
- [`deploy/`](deploy/) and [`deployment-config/`](deployment-config/) maintain production-ready manifests for on-chain upgrades, IPFS pinning, and orchestrator rollouts.
- Governance utilities in [`scripts/`](scripts/) and `npm run owner:*` commands allow owners to inspect, pause, or retune the platform without touching Solidity.

---

## 📚 Knowledge Vault
Dive deeper through the knowledge vault:

- [`docs/`](docs/) – architecture briefs, component guides, cinematic treatments, and sovereignty strategies.
- [`internal_docs/`](internal_docs/) – detailed operator dispatches, compliance annexes, and deep-dive analyses.
- [`CHANGELOG.md`](CHANGELOG.md) – release narrative and module deltas.
- [`MIGRATION.md`](MIGRATION.md) – step-by-step upgrade choreography for protocol and agent layers.
- [`RUNBOOK.md`](RUNBOOK.md) & [`OperatorRunbook.md`](OperatorRunbook.md) – mission control playbooks and executive operations templates.

AGI Jobs v0 (v2) ships as a flawless, user-friendly, secure, and production-ready intelligence continuum—ready to be launched by a non-technical mission commander with confidence that every workflow is green, unstoppable, and under sovereign control.
