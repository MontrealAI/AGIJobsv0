# CULTURE Demo Implementation Sprint Plan

> Ultra-deep audit trail: Every task below includes assumptions, counter-analysis, and independent
> verification hooks. The plan intentionally over-specifies control points so that multiple
> engineering pods can execute in parallel without ambiguity while continuously challenging
> underlying premises.

## 0. Mission Synthesis

### Objective
Deliver a first-class 🎖️ CULTURE 👁️✨ demonstration that simultaneously showcases
cultural accumulation (persistent knowledge artefacts) and self-play (autonomous teacher↔student↔critic
loops) on top of AGI Jobs v0 (v2).

### Success Criteria
1. **Functional Excellence** – CultureRegistry and SelfPlayArena contracts enforce provenance,
   governance, and reward semantics with >90% coverage.
2. **Operational Empowerment** – Non-technical owner can launch culture artefacts and arena rounds
   via one-click UI flows and runbook-driven controls.
3. **Observability** – Culture graph influence metrics and arena learning curves rendered in UI,
   reported weekly.
4. **CI/CD** – Dedicated, fully green pipeline (`culture-ci.yml`) covering contracts, services,
   and front-end E2E tests.

### Assumptions & Challenge
- **A1**: AGI Jobs v0 (v2) core contracts already deployed locally. *Counter*: Provide fallback
  Hardhat deployment script in compose entrypoint.
- **A2**: IdentityRegistry exposes role-based queries. *Challenge*: include adapter interface so
  contract can switch to alternate auth module if IR API diverges.
- **A3**: Non-technical owner prefers zero-wallet UX. *Counter*: Keep optional direct web3 flow for
  advanced operators.

## 1. Workstream Breakdown

### 1.1 Smart Contracts

| Ticket | Description | Alt-views & Tests |
|--------|-------------|-------------------|
| CR-01 | Implement `CultureRegistry.sol`. | **Alt perspective**: Instead of on-chain arrays for citations, store events only? Rejected because indexer requires on-chain source-of-truth. **Tests**: unit + fuzz verifying cite uniqueness, parent existence. |
| CR-02 | Foundry test suite & invariant checks. | **Disproof attempt**: Could rely solely on off-chain validation? No; regulatory compliance demands on-chain provenance. |
| SA-01 | Implement `SelfPlayArena.sol` with pausable, owner controls, Round struct. | **Alternate**: use existing JobRegistry only? We still need domain-specific fields (difficulty, Elo events). |
| SA-02 | Foundry round lifecycle, validator slashing simulation, fuzz on difficulty bounds. | **Edge**: what if orchestrator disappears mid-round? Ensure timeout handling. |

### 1.2 Backend Orchestrator

| Ticket | Description | Counter-check |
|--------|-------------|---------------|
| AO-01 | Express router with `/arena/start`, `/arena/status`, `/arena/scoreboard`. | Validate via contract event replay to ensure idempotency. |
| AO-02 | `arena.service.ts` implementing teacher→student→critic pipeline with retries. | Cross-check by simulating failure injection (no student response). |
| AO-03 | Adaptive controls modules (`difficulty.ts`, `elo.ts`, `qd.ts`, `agijobs.ts`). | Mathematical verification of PID constants, Elo invariants (total rating approx. conserved). |
| AO-04 | Jest coverage >95% on pure modules; integration harness with mocked AGI Jobs SDK. | Use property-based tests for difficulty controller. |

### 1.3 Culture Graph Indexer

| Ticket | Description | Alternative paths |
|--------|-------------|-------------------|
| CG-01 | Event listener + persistence (SQLite + Prisma) for artifacts/citations. | Evaluate TheGraph subgraph viability; fallback to custom service due to advanced influence metrics. |
| CG-02 | Influence computation (PageRank + lineage depth). | Confirm results by double-implementing: NetworkX simulation script vs in-service implementation. |
| CG-03 | GraphQL API with pagination, filter by kind, search by author. | Fuzz query parameters to avoid DOS. |

### 1.4 Culture Studio UI

| Ticket | Description | Verification |
|--------|-------------|-------------|
| UI-01 | CreateBook flow with assistant integration, IPFS upload, mint call. | Run moderated prompt suite; integrate red-team harness to catch NSFW/plagiarism. |
| UI-02 | ArtifactGraph visualisation (D3/force-directed) + derivative job launcher. | Compare layout determinism by seeding RNG; snapshot tests for DOM. |
| UI-03 | StartArena wizard + live telemetry + Scoreboard charts. | Simulate orchestrator downtime to confirm graceful degradation. |
| UI-04 | Cypress journeys for CreateBook and Arena flows. | Cross-browser (Chromium/Webkit) smoke tests. |

### 1.5 Ops, Docs, CI

| Ticket | Description | Double-check |
|--------|-------------|--------------|
| OPS-01 | Deployment scripts (`deploy.culture.ts`, `seed.culture.ts`). | Validate against local + Goerli; compare gas costs with Foundry `gas-snapshots`. |
| OPS-02 | Owner CLI (`scripts/owner/*.ts`) for pause/roles/params. | Unit tests with Hardhat impersonation. |
| OPS-03 | Docker compose with healthchecks, dependency ordering, log aggregation. | Chaos test: restart indexer while arena mid-round to ensure idempotent recovery. |
| OPS-04 | `culture-ci.yml` hooking into root workflow; coverage threshold enforcement. | Run CI on clean environment (GitHub runner) + local to confirm parity. |
| OPS-05 | Weekly report generators (culture + arena). | Validate data via SQL queries and orchestrator metrics; include checksum of report inputs. |

## 2. Timeline (10 Working Days)

| Day | Focus | Verification & Challenge |
|-----|-------|-------------------------|
| 1 | Repo scaffolding, contract interfaces, compose skeleton. | Run static analyzers, ensure no cyc deps. Alternative: adopt Nx workspace? decided against due to weight. |
| 2 | CultureRegistry implementation + tests. | Peer-review for reentrancy/reserve assumption. |
| 3 | SelfPlayArena core + tests. | Pen-test scenarios: unauthorized startRound, stale rounds. |
| 4 | Orchestrator service skeleton, difficulty/Elo modules, unit tests. | Compare Elo output with reference Python script (double implementation). |
| 5 | Indexer DB schema, event ingestion, GraphQL API. | Replay synthetic event log, ensure deterministic PageRank vs NetworkX script. |
| 6 | UI CreateBook + ArtifactGraph prototypes. | UX review with non-technical testers; record feedback. |
| 7 | Arena wizard + telemetry; scoreboard charts. | Load-test orchestrator endpoints with k6 to ensure concurrency tolerance. |
| 8 | Integration E2E dry runs; implement moderation, failure-handling. | Fire-drill: disable validator to ensure slashing path triggers. |
| 9 | Documentation (runbook, weekly reports), owner scripts, docker hardening. | Validate by running full stack from clean machine script. |
| 10 | CI hardening, security review, green build, final sign-off. | External audit checklist, fuzz tests overnight.

## 3. Risk Register

| Risk | Mitigation | Residual |
|------|------------|----------|
| Validator collusion | Randomised committees + StakeManager slashing + telemetry alerts. | Medium – monitor validator supply. |
| Orchestrator crash mid-round | Idempotent round state replay from chain; persisted orchestrator journal. | Low after journaling implemented. |
| IPFS availability | Pinning service redundancy + local gateway fallback. | Low. |
| UX overwhelm | Guided flows with copy tested on non-technical pilot users. | Low. |

## 4. Verification Toolkit

- **Mathematical**: Jupyter notebooks verifying Elo invariants, PID stability (Bode plots).
- **Simulation**: Hardhat fork tests replaying 100+ synthetic rounds.
- **Static Analysis**: Slither, MythX for contracts; ESLint/Sonar for TypeScript.
- **Dynamic**: Cypress component tests, Playwright cross-browser smoke.
- **External**: Manual review by security guild; third-party agent red teaming.

## 5. Deliverables Checklist

- [ ] Contracts deployed with verified source on Etherscan-equivalent.
- [ ] Indexer GraphQL schema documented and versioned.
- [ ] UI flows recorded (loom) for onboarding package.
- [ ] CI badge green on README + branch protection updated.
- [ ] Weekly reports committed with signed provenance hash.

Maintaining this plan as a living document ensures the CULTURE demo reaches production-grade
maturity while continuously challenging assumptions through rigorous cross-verification.
