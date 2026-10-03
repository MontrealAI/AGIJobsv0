# AGI Jobs v0 (v2) — Demo → ASI Takeoff

> AGI Jobs v0 (v2) is our sovereign intelligence engine; this module extends that superintelligent machine with specialised capabilities for `demo/asi-takeoff`.

## Overview
- **Path:** `demo/asi-takeoff/README.md`
- **Module Focus:** Anchors Demo → ASI Takeoff inside the AGI Jobs v0 (v2) lattice so teams can orchestrate economic, governance, and operational missions with deterministic guardrails.
- **Integration Role:** Interfaces with the unified owner control plane, telemetry mesh, and contract registry to deliver end-to-end resilience.

## Run the three-job local walkthrough

Complete the [root setup](../../docs/START_HERE.md#reproduce-the-local-baseline), then run:

```bash
npm run demo:asi-takeoff:local
```

The launcher starts a disposable chain, deploys the v2 contracts, and executes the agriculture, infrastructure, and healthcare scenarios. Each job passes through creation, submission, validator selection, commit/reveal, validation, and employer settlement. The mission driver checks the final on-chain status before reporting success.

Open `reports/localhost/asi-takeoff/asi-takeoff-report.md` for the readable report and `reports/localhost/asi-takeoff/receipts/jobs/` for transaction receipts and balance changes. The economic transactions execute on the local chain with mock tokens and configured demonstration results; they do not demonstrate delivery of the real-world projects described by the scenarios.

The first contract compilation can take several minutes. No wallet setup is needed for the default local fixtures. Anvil is preferred; the installed Hardhat node is the fallback. The launcher binds to `127.0.0.1`, checks chain ID 31337, and stops its own node on exit. If port 8545 is occupied, use `DEMO_PORT=18545 npm run demo:asi-takeoff:local`; existing nodes are left running. Remove conflicting exported RPC/chain settings before retrying. Compiler jobs run sequentially to limit memory use, and incremental compilation refreshes stale artifacts.

## Capabilities
- Provides opinionated configuration and assets tailored to `demo/asi-takeoff` while remaining interoperable with the global AGI Jobs v0 (v2) runtime.
- Ships with safety-first defaults so non-technical operators can activate the experience without compromising security or compliance.
- Publishes ready-to-automate hooks for CI, observability, and ledger reconciliation.

## Systems Map
```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_asi_takeoff[[Demo → ASI Takeoff]]
    demo_asi_takeoff --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```

## Working With This Module
1. Follow the [root setup](../../docs/START_HERE.md#reproduce-the-local-baseline) to install the pinned toolchain and locked dependencies.
2. Inspect the scripts under `scripts/` or this module's `package.json` entry (where applicable) to discover targeted automation for `demo/asi-takeoff`.
3. Run `npm test` and `npm run lint --if-present`, then check the workflows for the exact pull-request commit.
4. Capture mission telemetry with `make operator:green` or the module-specific runbooks documented in [`OperatorRunbook.md`](../../OperatorRunbook.md).

## Directory Guide
### Key Directories
- `bin`
- `config`
### Key Files
- `env.example`
- `Makefile`
- `project-plan.json`
- `project-plan.planetary.json`
- `RUNBOOK.md`

## Quality & Governance
- Every change must land through a pull request with all required checks green (unit, integration, linting, security scan).
- Reference [`RUNBOOK.md`](../../RUNBOOK.md) and [`OperatorRunbook.md`](../../OperatorRunbook.md) for escalation patterns and owner approvals.
- Keep secrets outside the tree; use the secure parameter stores wired to the AGI Jobs v0 (v2) guardian mesh.

## Next Steps
- Review this module's issue board for open automation, data, or research threads.
- Link new deliverables back to the central manifest via `npm run release:manifest`.
- Publish artefacts (dashboards, mermaid charts, datasets) into `reports/` for downstream intelligence alignment.
