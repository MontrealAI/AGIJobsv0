# AGI Jobs v0 (v2) — Demo → CULTURE v0 → Indexers → Culture Graph Indexer

> AGI Jobs v0 (v2) is our sovereign intelligence engine; this module extends that superintelligent machine with specialised capabilities for `demo/CULTURE-v0/indexers/culture-graph-indexer`.

## Overview
- **Path:** `demo/CULTURE-v0/indexers/culture-graph-indexer/README.md`
- **Module Focus:** Anchors Demo → CULTURE v0 → Indexers → Culture Graph Indexer inside the AGI Jobs v0 (v2) lattice so teams can orchestrate economic, governance, and operational missions with deterministic guardrails.
- **Integration Role:** Interfaces with the unified owner control plane, telemetry mesh, and contract registry to deliver end-to-end resilience.

## Capabilities
- Provides opinionated configuration and assets tailored to `demo/CULTURE-v0/indexers/culture-graph-indexer` while remaining interoperable with the global AGI Jobs v0 (v2) runtime.
- Ships with safety-first defaults so non-technical operators can activate the experience without compromising security or compliance.
- Publishes ready-to-automate hooks for CI, observability, and ledger reconciliation.

## Systems Map
```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_CULTURE_v0_indexers_culture_graph_indexer[[Demo → CULTURE v0 → Indexers → Culture Graph Indexer]]
    demo_CULTURE_v0_indexers_culture_graph_indexer --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```

## Working With This Module
1. From the repository root run `npm install` once to hydrate all workspaces.
2. Inspect the scripts under `scripts/` or this module's `package.json` entry (where applicable) to discover targeted automation for `demo/CULTURE-v0/indexers/culture-graph-indexer`.
3. Execute `npm test` and `npm run lint --if-present` before pushing to guarantee a fully green AGI Jobs v0 (v2) CI signal.
4. Capture mission telemetry with `make operator:green` or the module-specific runbooks documented in [`OperatorRunbook.md`](../../../../OperatorRunbook.md).
   - Prisma client artefacts are generated automatically by `scripts/ensure-prisma-client.mjs` when you run `npm test`; set `DATABASE_URL` if you need a non-default datasource for generation (defaults to `file:.tmp/dev.db`).

## Directory Guide
### Key Directories
- `prisma`
- `scripts`
- `src`
- `test`
### Key Files
- `.eslintrc.cjs`
- `.prettierrc`
- `Dockerfile`
- `package-lock.json`
- `package.json`
- `tsconfig.json`
- `vitest.config.ts`

## Quality & Governance
- Every change must land through a pull request with all required checks green (unit, integration, linting, security scan).
- Reference [`RUNBOOK.md`](../../../../RUNBOOK.md) and [`OperatorRunbook.md`](../../../../OperatorRunbook.md) for escalation patterns and owner approvals.
- Keep secrets outside the tree; use the secure parameter stores wired to the AGI Jobs v0 (v2) guardian mesh.

## Next Steps
- Review this module's issue board for open automation, data, or research threads.
- Link new deliverables back to the central manifest via `npm run release:manifest`.
- Publish artefacts (dashboards, mermaid charts, datasets) into `reports/` for downstream intelligence alignment.
