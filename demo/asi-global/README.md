# AGI Jobs v0 (v2) — Demo → ASI Global

> AGI Jobs v0 (v2) is our sovereign intelligence engine; this module extends that superintelligent machine with specialised capabilities for `demo/asi-global`.

## Run the local mission

Complete the [pinned root setup](../../docs/START_HERE.md#reproduce-the-local-baseline), then run from the repository root:

```bash
npm run demo:asi-global:local
```

This launches a disposable loopback chain, deploys the actual modular contracts, and settles three scenario jobs. The mission retains its configured validator committees (5, 4, and 5 validators), commits and reveals votes, checks each finalized job, and verifies worker/validator payouts. Open `reports/localhost/asi-global/asi-global-report.md`; transaction evidence is under `receipts/jobs/`.

The work, identities, and token are local fixtures. Real contract settlement does not demonstrate delivery of the physical projects described by the mission. No live wallet or provider credentials are needed. Anvil is optional; the installed Hardhat node is the fallback. The node stops when the command finishes. Later live owner commands require a separately managed test deployment.

If port 8545 is occupied, run `DEMO_PORT=18545 npm run demo:asi-global:local`. Existing nodes are preserved. A unique `AURORA_REPORT_SCOPE` preserves separate runs; defaults reuse the mission's namespace. Allow several minutes for initial compilation. Missing configurations, duplicate receipt names, incomplete settlements, and placeholder transaction hashes fail visibly.

[All demos and troubleshooting](../README.md)

The legacy receipt-format generators remain in `scripts/*-stub.js` for fixture tests. They require `AGI_DEMO_ALLOW_PLACEHOLDERS=1`, label their output `evidenceClass: placeholder` and `settled: false`, and are not part of the local settlement launcher.

## Overview
- **Path:** `demo/asi-global/README.md`
- **Module Focus:** Anchors Demo → ASI Global inside the AGI Jobs v0 (v2) lattice so teams can orchestrate economic, governance, and operational missions with deterministic guardrails.
- **Integration Role:** Interfaces with the unified owner control plane, telemetry mesh, and contract registry to deliver end-to-end resilience.

## Capabilities
- Provides opinionated configuration and assets tailored to `demo/asi-global` while remaining interoperable with the global AGI Jobs v0 (v2) runtime.
- Ships with safety-first defaults so non-technical operators can activate the experience without compromising security or compliance.
- Publishes ready-to-automate hooks for CI, observability, and ledger reconciliation.

## Systems Map
```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_asi_global[[Demo → ASI Global]]
    demo_asi_global --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```

## Working With This Module
1. Follow the [root setup](../../docs/START_HERE.md#reproduce-the-local-baseline) to install the pinned toolchain and locked dependencies.
2. Inspect the scripts under `scripts/` or this module's `package.json` entry (where applicable) to discover targeted automation for `demo/asi-global`.
3. Execute `npm test` and `npm run lint --if-present` before pushing, then inspect CI for the exact commit.
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
