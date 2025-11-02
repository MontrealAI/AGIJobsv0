# AGI Jobs v0 (v2)

[![CI (v2)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)
[![Static Analysis](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/static-analysis.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/static-analysis.yml)
[![Fuzz](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/fuzz.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/fuzz.yml)
[![Webapp](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/webapp.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/webapp.yml)
[![Containers](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/containers.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/containers.yml)
[![Orchestrator](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/orchestrator-ci.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/orchestrator-ci.yml)
[![E2E](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/e2e.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/e2e.yml)
[![Security Scorecard](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/scorecard.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/scorecard.yml)

AGI Jobs v0 (v2) is delivered as a production-hardened intelligence platform—a superintelligent machine engineered to compound value, command critical infrastructure, and realign global-scale operations with verifiable safety.

## Why It Matters
- **Unified Intelligence:** Orchestrates smart contracts, agent gateways, validators, and observability into a cohesive mission fabric.
- **Operator Ready:** Non-technical mission owners can activate playbooks through curated runbooks and one-click demos.
- **Safety First:** Every component inherits deterministic guardrails, sentinel monitoring, and immutable audit flows.

## Repository Structure
### Strategic Directories
- `.github`
- `agent-gateway`
- `apps`
- `attestation`
- `backend`
- `ci`
- `config`
- `contracts`
- `cypress`
- `data`
- `demo`
- `deploy`
- `deployment-config`
- `docs`
- `echidna`
- `examples`
- `gas-snapshots`
- `internal_docs`
- `kardashev_ii_omega_grade_alpha_agi_business_3_demo`
- `kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2`

### Key Files
- `.coveragerc`
- `.dockerignore`
- `.env`
- `.env.example`
- `.gitignore`
- `.npmrc`
- `.nvmrc`
- `.prettierrc`
- `.solcover.js`
- `.solhint.ci.json`
- `.solhint.json`
- `.trivyignore`
- `audit-ci.json`
- `CHANGELOG.md`
- `compose.yaml`
- `cypress.config.ts`
- `echidna.yaml`
- `eslint.config.js`
- `foundry.toml`
- `hardhat.config.js`

## Getting Started
1. Ensure you are running Node.js 20.18.1 (matching `.nvmrc`) and Python 3.11+.
2. Bootstrap dependencies:
   ```bash
   npm install
   python -m pip install -r requirements-python.txt
   ```
3. Run the deterministic toolchain preflight to confirm lockfile and runtime parity:
   ```bash
   npm run ci:preflight
   ```
4. Validate the full CI workflow locally:
   ```bash
   npm run lint --if-present
   npm test
   npm run webapp:build --if-present
   make operator:green
   ```
5. Commit using signed commits and open a pull request—CI on main enforces the same suite to guarantee an evergreen, fully green signal.

> **Guardrail:** Never hand-edit `package-lock.json`. If a dependency changes, run `npm install --package-lock-only` from the affected workspace so `ci:preflight` stays green.

## Architecture
```mermaid
flowchart TD
    subgraph Owners[Owner Control Plane]
        Runbooks --> Policy
        Policy --> Upgrades
    end

    subgraph Core[AGI Jobs v0 (v2) Core Intelligence]
        Contracts[[Smart Contracts]]
        Services[[Node & API Services]]
        Apps[[Operator & Validator Apps]]
        DataLake[(Knowledge Graph & Telemetry)]
    end

    subgraph Frontiers[Mission Demos & Scenarios]
        Demos[[High-Stakes Scenarios]]
    end

    Owners --> Core
    Core --> Observability[[CI / CD, Security, QA]]
    Core --> Governance[[Sentinel & Thermostat]]
    Core --> Frontiers
    Frontiers --> Feedback[[Learning & Alignment Loop]]
```

## Mission Operations
- **Owner Control:** Use the scripts under `scripts/v2/` (`owner:*`, `platform:*`, `thermostat:*`) to steer upgrades, registry changes, and emergency responses.
- **Agent Gateway:** Reference [`agent-gateway/`](agent-gateway/README.md) for mission-to-agent integration patterns.
- **Validator Mesh:** See [`apps/validator-ui/`](apps/validator-ui/README.md) and [`demo/Validator-Constellation-v0/`](demo/Validator-Constellation-v0/README.md) for validator orchestration.
- **Thermal Stability:** [`services/thermostat/`](services/thermostat/README.md) documents the thermal regulation engine that guards systemic health.

## Always-Green CI Signal Deck
- **Single source of truth:** The `ci (v2)` workflow exposes 23 required contexts that map 1:1 with [`ci/required-contexts.json`](ci/required-contexts.json). The lint stage fails fast when display names drift so branch protection never hides a status for owners or reviewers.【F:.github/workflows/ci.yml†L33-L71】【F:ci/required-contexts.json†L1-L23】
- **Operations guide:** [CI v2 operations](docs/v2-ci-operations.md) and the [branch protection checklist](docs/ci-v2-branch-protection-checklist.md) walk administrators through enforcing the checks on `main`, including CLI commands that sync the rule and export an auditable status table for compliance teams.【F:docs/v2-ci-operations.md†L1-L182】【F:docs/ci-v2-branch-protection-checklist.md†L1-L206】
- **Companion workflows:** Static analysis, fuzzing, web application smoke tests, orchestrator rehearsals, and deterministic e2e drills are all surfaced as required checks so the Checks tab stays comprehensible to non-technical stakeholders. Each badge above links directly to its workflow for live status and history.【F:.github/workflows/static-analysis.yml†L1-L157】【F:.github/workflows/fuzz.yml†L1-L144】【F:.github/workflows/webapp.yml†L1-L196】【F:.github/workflows/orchestrator-ci.yml†L1-L214】【F:.github/workflows/e2e.yml†L1-L164】
- **Summary artefacts:** Every CI run uploads `reports/ci/status.md` and `status.json`, letting release captains attach a machine-readable audit trail to their change tickets without leaving GitHub. The upload step now fails the workflow if the artefacts are ever missing, guaranteeing the evidence is immutable and reviewable.【F:.github/workflows/ci.yml†L1130-L1259】
- **Preflight enforcement:** Contributors must run `npm run ci:preflight` locally and in automation. The script validates `.nvmrc`, `package.json` engine pins, `packageManager`, and every `package-lock.json` to ensure the orchestration remains reproducible.【F:package.json†L3-L7】【F:package.json†L135-L142】【F:scripts/ci/check-toolchain-locks.js†L1-L120】【F:scripts/ci/check-lock-integrity.js†L1-L78】

### Pipeline topology
```mermaid
flowchart LR
    classDef base fill:#ecfeff,stroke:#0369a1,color:#0f172a,stroke-width:1px;
    classDef audit fill:#f1f5f9,stroke:#1e293b,color:#0f172a,stroke-width:1px;
    classDef demo fill:#fef2f2,stroke:#b91c1c,color:#7f1d1d,stroke-width:1px;
    classDef analytics fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95,stroke-width:1px;

    lint["Lint & static checks"]:::base
    tests["Tests"]:::base
    pyUnit["Python unit tests"]:::analytics
    pyInt["Python integration tests"]:::analytics
    pyLoad["Load-simulation reports"]:::analytics
    pyCov["Python coverage enforcement"]:::analytics
    foundry["Foundry"]:::base
    coverage["Coverage thresholds"]:::base
    invariants["Invariant tests"]:::base
    hgm["HGM guardrails"]:::audit
    ownerCtl["Owner control assurance"]:::audit
    phase6["Phase 6 readiness"]:::demo
    phase8["Phase 8 readiness"]:::demo
    kardashev["Kardashev II readiness"]:::demo
    asi["ASI Take-Off Demonstration"]:::demo
    zenith["Zenith Sapience Demonstration"]:::demo
    labor["AGI Labor Market Grand Demo"]:::demo
    mesh["Sovereign Mesh Demo — build"]:::demo
    constellation["Sovereign Constellation Demo — build"]:::demo
    archon["Celestial Archon Demonstration"]:::demo
    hypernova["Hypernova Governance Demonstration"]:::demo
    branchGuard["Branch protection guard"]:::audit
    summary["CI summary"]:::audit

    pyUnit --> pyCov
    pyInt --> pyCov
    lint --> hgm
    lint --> ownerCtl
    lint --> phase6
    lint --> phase8
    lint --> kardashev
    tests --> hgm
    tests --> foundry
    tests --> coverage
    tests --> phase6
    tests --> phase8
    tests --> kardashev
    tests --> asi
    tests --> zenith
    tests --> labor
    tests --> mesh
    tests --> constellation
    tests --> archon
    tests --> hypernova
    tests --> invariants
    pyCov --> summary
    pyLoad --> summary
    pyUnit --> summary
    pyInt --> summary
    lint --> summary
    tests --> summary
    foundry --> summary
    coverage --> summary
    invariants --> summary
    hgm --> summary
    ownerCtl --> summary
    phase6 --> summary
    phase8 --> summary
    kardashev --> summary
    asi --> summary
    zenith --> summary
    labor --> summary
    mesh --> summary
    constellation --> summary
    archon --> summary
    hypernova --> summary
    branchGuard --> summary
```

- The summary job fans in from every required context, so a single failure keeps the workflow red and writes an auditable status table to `reports/ci/status.{md,json}` for administrators. If the summary bundle is missing, the workflow now fails immediately, preserving the evidence trail for compliance teams.【F:.github/workflows/ci.yml†L1130-L1259】
- The branch protection guard audits the GitHub rule set against the JSON manifests, ensuring required contexts and companion workflows stay aligned with the enforced policy.【F:.github/workflows/ci.yml†L936-L1120】【F:ci/required-contexts.json†L1-L24】【F:ci/required-companion-contexts.json†L1-L11】
- Python coverage consolidation depends explicitly on the unit and integration suites so coverage gates only report green when both analytics layers succeed.【F:.github/workflows/ci.yml†L280-L345】

## Owner Command Surface
- **On-chain authority:** The [`OwnerConfigurator`](contracts/v2/admin/OwnerConfigurator.sol) lets the contract owner batch immutable parameter changes while emitting structured audit events for every mutation.【F:contracts/v2/admin/OwnerConfigurator.sol†L1-L111】
- **Immediate controls:** Run `npm run owner:system-pause`, `npm run owner:update-all`, or `npm run owner:command-center` to exercise treasury, pause, and module wiring scripts; these commands backstop emergency playbooks for non-technical operators.【F:package.json†L1-L332】
- **Authority matrix:** Generate or reference the [owner control authority matrix](docs/owner-control-authority-reference.md) to confirm every governable module, pausable subsystem, and treasury lever resolves to the correct owner addresses before upgrades. The matrix is refreshed in CI via `ci (v2) / Owner control assurance` and also renders locally with `npm run ci:owner-authority` for independent verification.【F:docs/owner-control-authority-reference.md†L1-L120】【F:.github/workflows/ci.yml†L386-L434】
- **Branch protection automation:** Administrators can enforce required contexts from the terminal with `npm run ci:enforce-branch-protection -- --dry-run` followed by a live run. This keeps non-technical owners in control of the safety rails while retaining full auditability.【F:docs/ci-v2-branch-protection-checklist.md†L118-L162】

## Quality Gates & CI
- Pull requests run linting, unit tests, security scans (`npm run security:audit`), SBOM generation, and scenario demos.
- Branch protection blocks merges unless **every** required workflow reports green, mirroring our mandate for a flawless, production-critical deployment.
- Use `npm run release:verify` and `npm run release:notes` before tagging to guarantee verifiable releases.

## Documentation & Support
- Deep-dive handbooks live in `docs/` (see [`docs/user-guides/`](docs/user-guides/README.md)).
- Operational safety escalations are codified in [`OperatorRunbook.md`](OperatorRunbook.md) and [`RUNBOOK.md`](RUNBOOK.md).
- Security posture, threat models, and disclosure process are in [`SECURITY.md`](SECURITY.md).

## Contributing
1. Fork the repository and create a feature branch.
2. Keep commits small, signed, and well-documented.
3. Update any impacted module README using `python tools/update_readmes.py` to keep documentation synchronized.
4. Open a pull request; link dashboards, datasets, or mermaid diagrams that showcase the mission impact.

## License
Released under the MIT License. See [`LICENSE`](LICENSE) for details.
