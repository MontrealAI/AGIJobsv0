# AGI Jobs v0 (v2) — Demo → AGI Alpha Node v0

> AGI Jobs v0 (v2) is our sovereign intelligence engine; this module extends that superintelligent machine with specialised capabilities for `demo/AGI-Alpha-Node-v0`.

## Overview
- **Path:** `demo/AGI-Alpha-Node-v0/README.md`
- **Module Focus:** Anchors Demo → AGI Alpha Node v0 inside the AGI Jobs v0 (v2) lattice so teams can orchestrate economic, governance, and operational missions with deterministic guardrails.
- **Integration Role:** Interfaces with the unified owner control plane, telemetry mesh, and contract registry to deliver end-to-end resilience.

## Capabilities
- Provides opinionated configuration and assets tailored to `demo/AGI-Alpha-Node-v0` while remaining interoperable with the global AGI Jobs v0 (v2) runtime.
- Ships with safety-first defaults so non-technical operators can activate the experience without compromising security or compliance.
- Publishes ready-to-automate hooks for CI, observability, and ledger reconciliation.

## Systems Map
```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_AGI_Alpha_Node_v0[[Demo → AGI Alpha Node v0]]
    demo_AGI_Alpha_Node_v0 --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```

## Working With This Module
1. From the repository root run `npm install` once to hydrate all workspaces.
2. Inspect the scripts under `scripts/` or this module's `package.json` entry (where applicable) to discover targeted automation for `demo/AGI-Alpha-Node-v0`.
3. Run the demo's test suite with `make test` (which invokes `python -m pytest` with plugin autoloading disabled) to avoid interference from globally installed pytest plugins.
4. Capture mission telemetry with `make operator:green` or the module-specific runbooks documented in [`OperatorRunbook.md`](../../OperatorRunbook.md).

## Directory Guide
### Key Directories
- `alpha_node`
- `config`
- `dashboard`
- `docker`
- `grand_demo`
- `grandiose_alpha_demo`
- `jobs`
- `logs`
- `monitoring`
- `scripts`
- `src`
- `state`
### Key Files
- `__init__.py`
- `config.example.yaml`
- `config.toml`
- `demo_ens_cache.json`
- `docker-compose.yaml`
- `docker-compose.yml`
- `Dockerfile`
- `ens_registry.csv`
- `jobs.json`
- `knowledge.json`
- `Makefile`
- `pytest.ini`

## Quality & Governance
- Every change must land through a pull request with all required checks green (unit, integration, linting, security scan).
- Reference [`RUNBOOK.md`](../../RUNBOOK.md) and [`OperatorRunbook.md`](../../OperatorRunbook.md) for escalation patterns and owner approvals.
- Keep secrets outside the tree; use the secure parameter stores wired to the AGI Jobs v0 (v2) guardian mesh.

## Next Steps
- Review this module's issue board for open automation, data, or research threads.
- Link new deliverables back to the central manifest via `npm run release:manifest`.
- Publish artefacts (dashboards, mermaid charts, datasets) into `reports/` for downstream intelligence alignment.
