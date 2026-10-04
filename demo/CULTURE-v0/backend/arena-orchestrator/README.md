# AGI Jobs v0 (v2) — Demo → CULTURE v0 → Backend → Arena Orchestrator

> **Current execution guide:** use the module's independent pnpm workspace from `demo/CULTURE-v0`; the repository root npm install does not hydrate this workspace. See the [CULTURE runbook](https://github.com/MontrealAI/AGIJobsv0/blob/main/demo/CULTURE-v0/RUNBOOK.md) for exact commands, service capabilities, and simulation boundaries. Existing architecture diagrams below are retained.


> AGI Jobs v0 (v2) is our sovereign intelligence engine; this module extends that superintelligent machine with specialised capabilities for `demo/CULTURE-v0/backend/arena-orchestrator`.

## Overview
- **Path:** `demo/CULTURE-v0/backend/arena-orchestrator/README.md`
- **Module Focus:** Anchors Demo → CULTURE v0 → Backend → Arena Orchestrator inside the AGI Jobs v0 (v2) lattice so teams can orchestrate economic, governance, and operational missions with deterministic guardrails.
- **Integration Role:** Interfaces with the unified owner control plane, telemetry mesh, and contract registry to deliver end-to-end resilience.

## Capabilities
- Provides opinionated configuration and assets tailored to `demo/CULTURE-v0/backend/arena-orchestrator` while remaining interoperable with the global AGI Jobs v0 (v2) runtime.
- Ships with safety-first defaults so non-technical operators can activate the experience without compromising security or compliance.
- Publishes ready-to-automate hooks for CI, observability, and ledger reconciliation.

## Systems Map
```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_CULTURE_v0_backend_arena_orchestrator[[Demo → CULTURE v0 → Backend → Arena Orchestrator]]
    demo_CULTURE_v0_backend_arena_orchestrator --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```

## Working With This Module

The HTTP service supports explicit arena operations with serialized lifecycle writes. Submission acknowledgements wait for persistence; evidence received after closure or the absolute deadline is rejected, and replayed events cannot overwrite accepted work. Winner selection is always an explicit operator review. Failed contract finalization leaves the confirmed difficulty/PID state and ratings unchanged. An ambiguous close fails the affected round closed. These safeguards do not make local snapshots a complete distributed transaction journal.

The bundled job registry is isolated per client/service and remains an in-memory fixture. Job IDs must correspond to real upstream jobs before using the service against a commissioned arena. In particular, an address and private key alone do not connect fixture job creation to an on-chain JobRegistry. For a reproducible adapter-only rehearsal, run `pnpm test:arena-adapter` from `demo/CULTURE-v0`; it provisions and cleans up its own chain with labeled mock dependencies.

| Operation | Contract mapping / behavior |
| --- | --- |
| Register student / validator | `registerParticipant(roundId, 0 or 1, jobId, address)` |
| Finalize | Observed success in basis points; no forced validation, invented validator winners, external Elo event, or implicit slashing. |
| Missing round | HTTP 404 with the requested ID. |
| Invalid, late, or duplicate evidence | HTTP 400 with an actionable explanation. |
| Unexpected storage/provider error | HTTP 500; inspect operator logs and reconcile before retrying. |

1. From `demo/CULTURE-v0`, run `corepack pnpm install --frozen-lockfile` to install this independent workspace.
2. Inspect the scripts under `scripts/` or this module's `package.json` entry (where applicable) to discover targeted automation for `demo/CULTURE-v0/backend/arena-orchestrator`.
3. From `demo/CULTURE-v0`, execute `corepack pnpm lint`, `corepack pnpm format`, and `corepack pnpm test:services`; the full CI additionally checks contracts, budgets, and the fixture stack.
4. Capture mission telemetry with `make operator:green` or the module-specific runbooks documented in [`OperatorRunbook.md`](../../../../OperatorRunbook.md).

## Directory Guide
### Key Directories
- `scripts`
- `src`
- `test`
### Key Files
- `.eslintrc.cjs`
- `.nycrc`
- `.prettierrc`
- `Dockerfile`
- `healthcheck.js`
- `jest.config.ts`
- `package-lock.json`
- `package.json`
- `server.mjs`
- `tsconfig.jest.json`
- `tsconfig.json`

## Quality & Governance
- Every change must land through a pull request with all required checks green (unit, integration, linting, security scan).
- Reference [`RUNBOOK.md`](../../../../RUNBOOK.md) and [`OperatorRunbook.md`](../../../../OperatorRunbook.md) for escalation patterns and owner approvals.
- Keep secrets outside the tree; use the secure parameter stores wired to the AGI Jobs v0 (v2) guardian mesh.

## Next Steps
- Review this module's issue board for open automation, data, or research threads.
- Link new deliverables back to the central manifest via `npm run release:manifest`.
- Publish artefacts (dashboards, mermaid charts, datasets) into `reports/` for downstream intelligence alignment.
