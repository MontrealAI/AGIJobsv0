# AGI Jobs v0 (v2) — Demo → CULTURE v0

> **Start here:** [Open the interactive Culture Studio](https://montrealai.github.io/AGIJobsv0/experiments/culture/) · [Operator runbook](RUNBOOK.md) · [Studio guide](apps/culture-studio/README.md)
>
> The published preview is a complete, deterministic browser learning loop: create a lesson, register its lineage, schedule a follow-on evaluation, inspect student scores, compare ratings and difficulty, and export the evidence. It uses no providers or real funds. The separate service stack remains an integration fixture; authentic production commissioning is not simulated away.



> AGI Jobs v0 (v2) is our sovereign intelligence engine; this module extends that superintelligent machine with specialised capabilities for `demo/CULTURE-v0`.

## Overview
- **Path:** `demo/CULTURE-v0/README.md`
- **Module Focus:** Anchors Demo → CULTURE v0 inside the AGI Jobs v0 (v2) lattice so teams can orchestrate economic, governance, and operational missions with deterministic guardrails.
- **Integration Role:** Interfaces with the unified owner control plane, telemetry mesh, and contract registry to deliver end-to-end resilience.

## Capabilities
- Provides opinionated configuration and assets tailored to `demo/CULTURE-v0` while remaining interoperable with the global AGI Jobs v0 (v2) runtime.
- Ships with safety-first defaults so non-technical operators can activate the experience without compromising security or compliance.
- Publishes ready-to-automate hooks for CI, observability, and ledger reconciliation.

## Systems Map
```mermaid
flowchart LR
    Operators((Mission Owners)) --> demo_CULTURE_v0[[Demo → CULTURE v0]]
    demo_CULTURE_v0 --> Core[[AGI Jobs v0 (v2) Core Intelligence]]
    Core --> Observability[[Unified CI / CD & Observability]]
    Core --> Governance[[Owner Control Plane]]
```

## Working With This Module

Use Node **22.23.3** from the root `.nvmrc`. This module is an independent **pnpm 10.5.2** workspace; a root npm installation does not install it.

```sh
cd demo/CULTURE-v0
corepack enable
pnpm install --frozen-lockfile
pnpm -r run build
pnpm run lint
```

For a browser-only preview, run:

```sh
VITE_DEMO_MODE=true pnpm --filter culture-studio dev --host 127.0.0.1
```

Open the URL printed by Vite. The visible **Interactive preview** banner identifies simulated drafting, uploads, minting, jobs, and rounds. This mode makes no service requests, spends no funds, and supplies illustrative results. All existing workflow screens remain available.

For service integration, leave `VITE_DEMO_MODE` unset or `false`, configure `VITE_ORCHESTRATOR_URL` and `VITE_INDEXER_URL`, then rebuild/restart the UI. Failed requests remain visible and never turn into simulated successes. Open **Operator connection** to enter the operator API token; it stays in browser memory and is sent only to the orchestrator. Never enter a wallet private key there.

The arena service can run locally after building:

```sh
pnpm --filter culture-arena-orchestrator start
```

Leave both arena address and operator key unset for its in-memory simulation. On-chain mode requires **all three** server settings: a deployed nonzero `SELF_PLAY_ARENA_ADDRESS`, its authorized `ORCHESTRATOR_PRIVATE_KEY`, and an independent `ORCHESTRATOR_API_TOKEN` of at least 32 characters. The legacy `SELFPLAY_ARENA_ADDRESS` alias is supported, but conflicting values stop startup. Use HTTPS and a secret store for remote deployments. Public reads remain available; writes require the token when configured. Corrupt state or failed chain initialization stops startup instead of silently resetting state.

Copy `.env.example` to `.env` before using Compose and replace its local placeholders. Its public Anvil keys are for disposable local networks only. Vite settings are build-time values, so rebuild the studio image after changing them. The full Compose/deployment path still needs the integration work listed below.

Run `pnpm test` for the module gates. Foundry **v1.4.4** is required for contract checks. Capture mission telemetry using the module runbooks and [`OperatorRunbook.md`](../../OperatorRunbook.md).

## Integration and release status

This module is a working preview and development integration, not a completed production deployment. The arena HTTP API implements round operations and telemetry; the studio's LLM, IPFS upload, artifact mint, job creation, and owner-control requests still require real provider implementations. Some backend adapters are simulations even when an on-chain arena client is selected. A configured address alone does not establish end-to-end settlement.

The 2026-10-04 local checks pass: 39 Foundry, 3 Hardhat, 101 orchestrator, 30 indexer, and 28 Studio model/API tests. Studio model/API coverage is 100% lines and 98.45% branches; orchestrator coverage is 99.04% lines and 97.8% branches within its configured coverage scope (which excludes several adapters and the service implementation). Browser checks exercise the complete preview journey, all four sections, keyboard-accessible content, and 320px/390px layouts. These are engineering checks, not an independent security certification. The 39 Foundry tests cover lifecycle, authorization, ownership transfer, configuration, and signed-difficulty boundaries; contract line coverage is 94.06% for CultureRegistry and 97.44% for SelfPlayArena. The indexer has 30 tests with 91.62% lines, 90.64% branches, and 93.42% functions in the current coverage report, including ordered live replay, graph growth, and validator outages. A separate compiled-runtime rehearsal verifies database migration, three real local-chain artifact events, graceful shutdown, and idempotent restart. The [gas baseline review](gas-snapshots/REVIEW-2026-10-03.md) explicitly records the two revised scenario ceilings and restored tests. These checks do not establish mainnet settlement or complete provider integration; see the [production-readiness record](../../docs/production/readiness-2026-10-03.md).

### Verify the arena adapter against the actual contract

```bash
# From demo/CULTURE-v0 after installing the locked workspace:
pnpm run test:arena-adapter
```

This automated rehearsal starts its own disposable local EVM, checks the compiled contract ABI, exercises the compiled adapter through start/register/close/finalize, and verifies that rejected validation never becomes a finalized round. It uses labeled mock dependencies, no external RPC, and no real funds. CI runs it alongside the contract tests. The service now enforces absolute submission deadlines and durable acknowledgements, requires explicitly reviewed winners, isolates job registries between clients, and preserves confirmed difficulty/PID state when contract finalization fails. The [runbook](RUNBOOK.md#42-launch-a-self-play-arena-round) explains these boundaries and recovery steps.

### Start the local fixture stack

With Docker Compose, Node 22.23.3, and pnpm 10.5.2 installed, run from `demo/CULTURE-v0`:

```bash
pnpm install --frozen-lockfile
pnpm run local:up
```

Open <http://localhost:4173>. Setup writes a separate `.env.local`, deploys the CULTURE contracts with explicitly labeled test dependency contracts on chain 31337, and seeds three artifacts. RPC and service ports bind to localhost. Existing local deployments are reused; shutdown with `pnpm run e2e:down` preserves volumes. If the chain was reset independently, setup stops rather than silently associating an old indexer database with a new deployment.

Run `pnpm run test:e2e` for the Compose health/ingestion checks and the Cypress UI walkthrough. Cypress uses explicit UI response fixtures; the separate health check verifies actual seeded-chain ingestion and rejects unauthenticated arena writes. LLM generation, IPFS upload/minting, job creation, paid settlement, and production dependency adapters still require their intended provider integrations. Local fixture keys must never be used on a funded network.

## Directory Guide
### Key Directories
- `apps`
- `backend`
- `ci`
- `config`
- `contracts`
- `cypress`
- `data`
- `gas-snapshots`
- `hardhat`
- `indexers`
- `logs`
- `monitoring`
### Key Files
- `.env.example`
- `.npmrc`
- `.solhint.json`
- `cypress.config.ts`
- `docker-compose.yml`
- `foundry.toml`
- `hardhat.config.ts`
- `hardhat.coverage.config.ts`
- `Makefile`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`

## Quality & Governance
- Every change must land through a pull request with all required checks green (unit, integration, linting, security scan).
- Reference [`RUNBOOK.md`](../../RUNBOOK.md) and [`OperatorRunbook.md`](../../OperatorRunbook.md) for escalation patterns and owner approvals.
- Keep secrets outside the tree; use the secure parameter stores wired to the AGI Jobs v0 (v2) guardian mesh.

## Next Steps
- Review this module's issue board for open automation, data, or research threads.
- Link new deliverables back to the central manifest via `npm run release:manifest`.
- Publish artefacts (dashboards, mermaid charts, datasets) into `reports/` for downstream intelligence alignment.
