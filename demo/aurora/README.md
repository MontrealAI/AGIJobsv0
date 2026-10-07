# AGI Jobs v0 (v2) — Demo → Aurora

> AGI Jobs v0 (v2) is our sovereign intelligence engine; this module extends that superintelligent machine with specialised capabilities for `demo/aurora`.

## Overview
- **Path:** `demo/aurora/README.md`
- **Module Focus:** Anchors Demo → Aurora inside the AGI Jobs v0 (v2) lattice so teams can orchestrate economic, governance, and operational missions with deterministic guardrails.
- **Integration Role:** Interfaces with the unified owner control plane, telemetry mesh, and contract registry to deliver end-to-end resilience.

## Run the local job lifecycle

Complete the [root setup](../../docs/START_HERE.md#reproduce-the-local-baseline), then run:

```bash
npm run demo:aurora:local
```

This deploys the v2 stack to a disposable local chain, executes one job through validator commit/reveal and employer settlement, exercises owner controls, and writes `reports/localhost/aurora/aurora-report.md`. Per-stage receipts and token balance changes are in `reports/localhost/aurora/receipts/`. The tokens, identities, and submitted work are demonstration fixtures; transactions are executed by the actual local contracts.

Anvil is preferred and Hardhat is the fallback. The node is bound to localhost with chain ID 31337. An occupied port is refused without stopping existing processes; select another with `DEMO_PORT=18545 npm run demo:aurora:local`. The launcher stops only its own node when finished. For three related jobs and a consolidated report, use the [ASI Take-Off walkthrough](../asi-takeoff/README.md#retained-local-contract-walkthrough).

## Capabilities
- Provides opinionated configuration and assets tailored to `demo/aurora` while remaining interoperable with the global AGI Jobs v0 (v2) runtime.
- Ships with safety-first defaults so non-technical operators can activate the experience without compromising security or compliance.
- Publishes ready-to-automate hooks for CI, observability, and ledger reconciliation.

## Systems Map
```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_aurora[[Demo → Aurora]]
    demo_aurora --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```

## Working With This Module
1. Follow the [root setup](../../docs/START_HERE.md#reproduce-the-local-baseline) to install the pinned toolchain and locked dependencies.
2. Inspect the scripts under `scripts/` or this module's `package.json` entry (where applicable) to discover targeted automation for `demo/aurora`.
3. Run `npm test` and `npm run lint --if-present`, then check the workflows for the exact pull-request commit.
4. Capture mission telemetry with `make operator:green` or the module-specific runbooks documented in [`OperatorRunbook.md`](../../OperatorRunbook.md).

## Directory Guide
### Key Directories
- `bin`
- `config`
- `docs`
### Key Files
- `aurora.demo.ts`
- `env.example`
- `Makefile`
- `RUNBOOK.md`

## Quality & Governance
- Every change must land through a pull request with all required checks green (unit, integration, linting, security scan).
- Reference [`RUNBOOK.md`](../../RUNBOOK.md) and [`OperatorRunbook.md`](../../OperatorRunbook.md) for escalation patterns and owner approvals.
- Keep secrets outside the tree; use the secure parameter stores wired to the AGI Jobs v0 (v2) guardian mesh.

## Next Steps
- Review this module's issue board for open automation, data, or research threads.
- Link new deliverables back to the central manifest via `npm run release:manifest`.
- Publish artefacts (dashboards, mermaid charts, datasets) into `reports/` for downstream intelligence alignment.
