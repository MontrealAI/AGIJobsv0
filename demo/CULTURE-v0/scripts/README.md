# AGI Jobs v0 (v2) — Demo → CULTURE v0 → Scripts

> **Current execution guide:** use the module's independent pnpm workspace from `demo/CULTURE-v0`; the repository root npm install does not hydrate this workspace. See the [CULTURE runbook](https://github.com/MontrealAI/AGIJobsv0/blob/main/demo/CULTURE-v0/RUNBOOK.md) for exact commands, service capabilities, and simulation boundaries. Existing architecture diagrams below are retained.


> AGI Jobs v0 (v2) is our sovereign intelligence engine; this module extends that superintelligent machine with specialised capabilities for `demo/CULTURE-v0/scripts`.

## Overview
- **Path:** `demo/CULTURE-v0/scripts/README.md`
- **Module Focus:** Anchors Demo → CULTURE v0 → Scripts inside the AGI Jobs v0 (v2) lattice so teams can orchestrate economic, governance, and operational missions with deterministic guardrails.
- **Integration Role:** Interfaces with the unified owner control plane, telemetry mesh, and contract registry to deliver end-to-end resilience.

## Capabilities
- Provides opinionated configuration and assets tailored to `demo/CULTURE-v0/scripts` while remaining interoperable with the global AGI Jobs v0 (v2) runtime.
- Ships with safety-first defaults so non-technical operators can activate the experience without compromising security or compliance.
- Publishes ready-to-automate hooks for CI, observability, and ledger reconciliation.

## Systems Map
```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_CULTURE_v0_scripts[[Demo → CULTURE v0 → Scripts]]
    demo_CULTURE_v0_scripts --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```

## Working With This Module
1. From `demo/CULTURE-v0`, run `corepack pnpm install --frozen-lockfile` to install this independent workspace.
2. Inspect the scripts under `scripts/` or this module's `package.json` entry (where applicable) to discover targeted automation for `demo/CULTURE-v0/scripts`.
3. From `demo/CULTURE-v0`, execute `corepack pnpm lint`, `corepack pnpm format`, and `corepack pnpm test:services`; the full CI additionally checks contracts, budgets, and the fixture stack.
4. Capture mission telemetry with `make operator:green` or the module-specific runbooks documented in [`OperatorRunbook.md`](../../../OperatorRunbook.md).

## Directory Guide
### Key Files
- `check-budgets.ts`
- `check-coverage-thresholds.mjs`
- `check-env.mjs`
- `deploy.culture.ts`
- `Dockerfile.smoke-tests`
- `export.weekly.ts`
- `generate.analytics.ts`
- `hardhat-utils.ts`
- `owner.setParams.ts`
- `owner.setRoles.ts`
- `register.contracts.ts`
- `run.arena.sample.ts`

## Quality & Governance
- Every change must land through a pull request with all required checks green (unit, integration, linting, security scan).
- Reference [`RUNBOOK.md`](../../../RUNBOOK.md) and [`OperatorRunbook.md`](../../../OperatorRunbook.md) for escalation patterns and owner approvals.
- Keep secrets outside the tree; use the secure parameter stores wired to the AGI Jobs v0 (v2) guardian mesh.

## Next Steps
- Review this module's issue board for open automation, data, or research threads.
- Link new deliverables back to the central manifest via `npm run release:manifest`.
- Publish artefacts (dashboards, mermaid charts, datasets) into `reports/` for downstream intelligence alignment.
