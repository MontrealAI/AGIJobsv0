# AGI Jobs v0 (v2) — Demo → Zenith Sapience

[![Zenith Sapience OmniDominion](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/demo-zenith-sapience-omnidominion.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/demo-zenith-sapience-omnidominion.yml)

> AGI Jobs v0 (v2) is our sovereign intelligence engine; this module extends that superintelligent machine with specialised capabilities for `demo/zenith-sapience`.

## Overview
- **Path:** `demo/zenith-sapience/README.md`
- **Module Focus:** Anchors Demo → Zenith Sapience inside the AGI Jobs v0 (v2) lattice so teams can orchestrate economic, governance, and operational missions with deterministic guardrails.
- **Integration Role:** Interfaces with the unified owner control plane, telemetry mesh, and contract registry to deliver end-to-end resilience.

## Capabilities
- Provides opinionated configuration and assets tailored to `demo/zenith-sapience` while remaining interoperable with the global AGI Jobs v0 (v2) runtime.
- Ships with safety-first defaults so non-technical operators can activate the experience without compromising security or compliance.
- Publishes ready-to-automate hooks for CI, observability, and ledger reconciliation.

## Systems Map
```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_zenith_sapience[[Demo → Zenith Sapience]]
    demo_zenith_sapience --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```

## Working With This Module
1. From the repository root run `npm install` once to hydrate all workspaces.
2. Inspect the scripts under `scripts/` or this module's `package.json` entry (where applicable) to discover targeted automation for `demo/zenith-sapience`.
3. Execute `npm test` and `npm run lint --if-present` before pushing to guarantee a fully green AGI Jobs v0 (v2) CI signal.
4. Capture mission telemetry with `make operator:green` or the module-specific runbooks documented in [`OperatorRunbook.md`](../../OperatorRunbook.md).

### OmniDominion rehearsal secrets

The [`demo-zenith-sapience-omnidominion.yml`](../../.github/workflows/demo-zenith-sapience-omnidominion.yml) workflow pulls validator and worker keys from optional repository secrets so owners can rotate credentials without editing source:

| Secret | Purpose | Default fallback |
| ------ | ------- | ---------------- |
| `DEMO_ZENITH_OMNIDOMINION_PRIVATE_KEY` | Local rehearsal signer for the OmniDominion demo. | Hardhat account `0xac0974…ff80` |
| `DEMO_ZENITH_AURORA_WORKER_KEY` | Worker node signer for Aurora rehearsal. | Hardhat account `0x59c699…690d` |
| `DEMO_ZENITH_AURORA_VALIDATOR1_KEY` | Validator 1 key. | Hardhat account `0x5de411…365a` |
| `DEMO_ZENITH_AURORA_VALIDATOR2_KEY` | Validator 2 key. | Hardhat account `0x7c8521…07a6` |
| `DEMO_ZENITH_AURORA_VALIDATOR3_KEY` | Validator 3 key. | Hardhat account `0x47e179…926a` |

Set the secrets in the repository or organisation to override the deterministic defaults before promoting to external networks.【F:.github/workflows/demo-zenith-sapience-omnidominion.yml†L55-L67】

## Directory Guide
### Key Files
- `architecture.md`
- `assurance-matrix.md`
- `mission-streams.md`

## Quality & Governance
- Every change must land through a pull request with all required checks green (unit, integration, linting, security scan).
- Reference [`RUNBOOK.md`](../../RUNBOOK.md) and [`OperatorRunbook.md`](../../OperatorRunbook.md) for escalation patterns and owner approvals.
- Keep secrets outside the tree; use the secure parameter stores wired to the AGI Jobs v0 (v2) guardian mesh.

## Next Steps
- Review this module's issue board for open automation, data, or research threads.
- Link new deliverables back to the central manifest via `npm run release:manifest`.
- Publish artefacts (dashboards, mermaid charts, datasets) into `reports/` for downstream intelligence alignment.
