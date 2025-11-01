# AGI Jobs v0 (v2) — Demo → AGI Alpha Node v0 → Grand Demo

> AGI Jobs v0 (v2) is our sovereign intelligence engine; this module extends that superintelligent machine with specialised capabilities for `demo/AGI-Alpha-Node-v0/grand_demo`.

## Overview
- **Path:** `demo/AGI-Alpha-Node-v0/grand_demo/README.md`
- **Module Focus:** Anchors Demo → AGI Alpha Node v0 → Grand Demo inside the AGI Jobs v0 (v2) lattice so teams can orchestrate economic, governance, and operational missions with deterministic guardrails.
- **Integration Role:** Interfaces with the unified owner control plane, telemetry mesh, and contract registry to deliver end-to-end resilience.

## Capabilities
- Provides opinionated configuration and assets tailored to `demo/AGI-Alpha-Node-v0/grand_demo` while remaining interoperable with the global AGI Jobs v0 (v2) runtime.
- Ships with safety-first defaults so non-technical operators can activate the experience without compromising security or compliance.
- Publishes ready-to-automate hooks for CI, observability, and ledger reconciliation.

## Systems Map
```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_AGI_Alpha_Node_v0_grand_demo[[Demo → AGI Alpha Node v0 → Grand Demo]]
    demo_AGI_Alpha_Node_v0_grand_demo --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```

## Working With This Module
1. From the repository root run `npm install` once to hydrate all workspaces.
2. Inspect the scripts under `scripts/` or this module's `package.json` entry (where applicable) to discover targeted automation for `demo/AGI-Alpha-Node-v0/grand_demo`.
3. Execute `npm test` and `npm run lint --if-present` before pushing to guarantee a fully green AGI Jobs v0 (v2) CI signal.
4. Capture mission telemetry with `make operator:green` or the module-specific runbooks documented in [`OperatorRunbook.md`](../../../OperatorRunbook.md).

## Directory Guide
### Key Directories
- `abis`
- `alpha_node`
- `config`
- `scripts`
- `storage`
- `tests`
### Key Files
- `docker-compose.yaml`
- `Dockerfile`
- `requirements-dev.txt`
- `requirements.txt`

## Quality & Governance
- Every change must land through a pull request with all required checks green (unit, integration, linting, security scan).
- Reference [`RUNBOOK.md`](../../../RUNBOOK.md) and [`OperatorRunbook.md`](../../../OperatorRunbook.md) for escalation patterns and owner approvals.
- Keep secrets outside the tree; use the secure parameter stores wired to the AGI Jobs v0 (v2) guardian mesh.

## Next Steps
- Review this module's issue board for open automation, data, or research threads.
- Link new deliverables back to the central manifest via `npm run release:manifest`.
- Publish artefacts (dashboards, mermaid charts, datasets) into `reports/` for downstream intelligence alignment.
