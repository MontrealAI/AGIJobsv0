# AGI Jobs v0 (v2) — Demo → ASI Global

[![ASI Global Demo](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/demo-asi-global.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/demo-asi-global.yml)

> AGI Jobs v0 (v2) is our sovereign intelligence engine; this module extends that superintelligent machine with specialised capabilities for `demo/asi-global`.

## Overview
- **Path:** `demo/asi-global/README.md`
- **Module Focus:** Anchors Demo → ASI Global inside the AGI Jobs v0 (v2) lattice so teams can orchestrate economic, governance, and operational missions with deterministic guardrails.
- **Integration Role:** Interfaces with the unified owner control plane, telemetry mesh, and contract registry to deliver end-to-end resilience.

## Capabilities
- Provides opinionated configuration and assets tailored to `demo/asi-global` while remaining interoperable with the global AGI Jobs v0 (v2) runtime.
- Ships with safety-first defaults so non-technical operators can activate the experience without compromising security or compliance.
- Publishes ready-to-automate hooks for CI, observability, and ledger reconciliation.

### CI Signal
- `.github/workflows/demo-asi-global.yml` executes deterministic and local rehearsals, pins toolchain versions, and ships artefacts to the PR checks wall.【F:.github/workflows/demo-asi-global.yml†L1-L76】
- The workflow badge above stays green only when the planetary demo passes every stage on `main` and on affected pull requests, mirroring the assurance pattern documented in [`docs/asi-global-orchestrator-demo.md`](../../docs/asi-global-orchestrator-demo.md).【F:docs/asi-global-orchestrator-demo.md†L1-L86】

## Systems Map
```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_asi_global[[Demo → ASI Global]]
    demo_asi_global --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
    Observability --> DemoChecks[(demo-asi-global CI)]
    DemoChecks --> Operators
```

## Working With This Module
1. From the repository root run `npm install` once to hydrate all workspaces.
2. Inspect the scripts under `scripts/` or this module's `package.json` entry (where applicable) to discover targeted automation for `demo/asi-global`.
3. Execute `npm test` and `npm run lint --if-present` before pushing to guarantee a fully green AGI Jobs v0 (v2) CI signal.
4. Capture mission telemetry with `make operator:green` or the module-specific runbooks documented in [`OperatorRunbook.md`](../../OperatorRunbook.md).

## Directory Guide
### Key Directories
- `bin`
- `config`
### Key Files
- `env.example`
- `project-plan.json`
- `RUNBOOK.md`

## Quality & Governance
- Every change must land through a pull request with all required checks green (unit, integration, linting, security scan).
- Reference [`RUNBOOK.md`](../../RUNBOOK.md) and [`OperatorRunbook.md`](../../OperatorRunbook.md) for escalation patterns and owner approvals.
- Keep secrets outside the tree; use the secure parameter stores wired to the AGI Jobs v0 (v2) guardian mesh.

## Next Steps
- Review this module's issue board for open automation, data, or research threads.
- Link new deliverables back to the central manifest via `npm run release:manifest`.
- Publish artefacts (dashboards, mermaid charts, datasets) into `reports/` for downstream intelligence alignment.
