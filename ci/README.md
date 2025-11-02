# CI v2 Manifest & Enforcement Deck

[![CI (v2)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)
[![Static Analysis](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/static-analysis.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/static-analysis.yml)
[![Fuzz](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/fuzz.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/fuzz.yml)
[![Webapp](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/webapp.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/webapp.yml)
[![Containers](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/containers.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/containers.yml)
[![E2E](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/e2e.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/e2e.yml)

## Live status wall

Every required context publishes its own badge so the assurance wall is visible on PRs, the default branch, and in external dashboards. Each badge links directly to the CI v2 workflow with the job pre-filtered, making drift obvious at a glance.

| Job | Badge |
| --- | --- |
| Lint & static checks | [![Lint & static checks](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Lint%20%26%20static%20checks)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22Lint+%26+static+checks%22) |
| Tests | [![Tests](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Tests)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3ATests) |
| Python unit tests | [![Python unit tests](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Python%20unit%20tests)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22Python+unit+tests%22) |
| Python integration tests | [![Python integration tests](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Python%20integration%20tests)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22Python+integration+tests%22) |
| Load-simulation reports | [![Load-simulation reports](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Load-simulation%20reports)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22Load-simulation+reports%22) |
| Python coverage enforcement | [![Python coverage enforcement](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Python%20coverage%20enforcement)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22Python+coverage+enforcement%22) |
| HGM guardrails | [![HGM guardrails](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=HGM%20guardrails)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22HGM+guardrails%22) |
| Owner control assurance | [![Owner control assurance](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Owner%20control%20assurance)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22Owner+control+assurance%22) |
| Foundry | [![Foundry](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Foundry)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3AFoundry) |
| Coverage thresholds | [![Coverage thresholds](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Coverage%20thresholds)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22Coverage+thresholds%22) |
| Phase 6 readiness | [![Phase 6 readiness](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Phase%206%20readiness)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22Phase+6+readiness%22) |
| Phase 8 readiness | [![Phase 8 readiness](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Phase%208%20readiness)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22Phase+8+readiness%22) |
| Kardashev II readiness | [![Kardashev II readiness](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Kardashev%20II%20readiness)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22Kardashev+II+readiness%22) |
| ASI Take-Off Demonstration | [![ASI Take-Off Demonstration](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=ASI%20Take-Off%20Demonstration)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22ASI+Take-Off+Demonstration%22) |
| Zenith Sapience Demonstration | [![Zenith Sapience Demonstration](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Zenith%20Sapience%20Demonstration)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22Zenith+Sapience+Demonstration%22) |
| AGI Labor Market Grand Demo | [![AGI Labor Market Grand Demo](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=AGI%20Labor%20Market%20Grand%20Demo)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22AGI+Labor+Market+Grand+Demo%22) |
| Sovereign Mesh Demo — build | [![Sovereign Mesh Demo — build](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Sovereign%20Mesh%20Demo%20%E2%80%94%20build)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22Sovereign+Mesh+Demo+%E2%80%94+build%22) |
| Sovereign Constellation Demo — build | [![Sovereign Constellation Demo — build](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Sovereign%20Constellation%20Demo%20%E2%80%94%20build)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22Sovereign+Constellation+Demo+%E2%80%94+build%22) |
| Celestial Archon Demonstration | [![Celestial Archon Demonstration](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Celestial%20Archon%20Demonstration)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22Celestial+Archon+Demonstration%22) |
| Hypernova Governance Demonstration | [![Hypernova Governance Demonstration](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Hypernova%20Governance%20Demonstration)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22Hypernova+Governance+Demonstration%22) |
| Branch protection guard | [![Branch protection guard](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Branch%20protection%20guard)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22Branch+protection+guard%22) |
| CI summary | [![CI summary](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=CI%20summary)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22CI+summary%22) |
| Invariant tests | [![Invariant tests](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=Invariant%20tests)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain+job%3A%22Invariant+tests%22) |

The `ci/` deck defines the manifest, verification scripts, and artefacts that keep AGI Jobs v0 (v2) permanently green. Required contexts here mirror the branch protection rule; automation in `.github/workflows/ci.yml` fails immediately when drift is detected, so release captains always see the full assurance wall.【F:.github/workflows/ci.yml†L22-L292】【F:.github/workflows/ci.yml†L966-L1130】

## Workflow topology
```mermaid
flowchart LR
    classDef base fill:#ecfeff,stroke:#0369a1,color:#0f172a,stroke-width:1px;
    classDef analytics fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95,stroke-width:1px;
    classDef demo fill:#fef2f2,stroke:#b91c1c,color:#7f1d1d,stroke-width:1px;
    classDef guard fill:#f1f5f9,stroke:#1e293b,color:#0f172a,stroke-width:1px;

    lint[Lint & static checks]:::base --> hgm[HGM guardrails]:::guard
    lint --> ownerCtl[Owner control assurance]:::guard
    tests[Tests]:::base --> foundry[Foundry]:::base
    tests --> coverage[Coverage thresholds]:::base
    tests --> invariants[Invariant tests]:::guard
    tests --> demos[Phase + demo suites]:::demo
    pyUnit[Python unit tests]:::analytics --> pyCov[Python coverage enforcement]:::analytics
    pyInt[Python integration tests]:::analytics --> pyCov
    pyLoad[Load-simulation reports]:::analytics --> summary[CI summary]:::guard
    branchGuard[Branch protection guard]:::guard --> summary
    foundry --> summary
    coverage --> summary
    invariants --> summary
    hgm --> summary
    ownerCtl --> summary
    demos --> summary
    pyCov --> summary
    lint --> summary
    tests --> summary
```

## Required contexts (`ci (v2)`)
| Job | Context name | Focus |
| --- | ------------- | ----- |
| `lint` | `ci (v2) / Lint & static checks` | Hardhat + TypeScript lint, manifest validation, toolchain lock enforcement.【F:.github/workflows/ci.yml†L44-L74】 |
| `tests` | `ci (v2) / Tests` | Contract compilation, test execution, ABI drift guard.【F:.github/workflows/ci.yml†L75-L117】 |
| `python_unit` | `ci (v2) / Python unit tests` | Paymaster, tools, orchestrator, and simulation unit analytics with coverage export.【F:.github/workflows/ci.yml†L118-L167】 |
| `python_integration` | `ci (v2) / Python integration tests` | API + demo integrations plus coverage export.【F:.github/workflows/ci.yml†L168-L215】 |
| `python_load_sim` | `ci (v2) / Load-simulation reports` | Monte Carlo sweeps writing CSV + JSON stress reports.【F:.github/workflows/ci.yml†L216-L292】 |
| `python_coverage` | `ci (v2) / Python coverage enforcement` | Combines analytics coverage sets and enforces thresholds.【F:.github/workflows/ci.yml†L293-L349】 |
| `hgm_guardrails` | `ci (v2) / HGM guardrails` | Node + Python governance regression suite.【F:.github/workflows/ci.yml†L350-L392】 |
| `owner_controls` | `ci (v2) / Owner control assurance` | Owner doctor + authority matrix regeneration.【F:.github/workflows/ci.yml†L393-L439】 |
| `foundry` | `ci (v2) / Foundry` | Forge fuzz testing for Solidity surface.【F:.github/workflows/ci.yml†L440-L491】 |
| `coverage` | `ci (v2) / Coverage thresholds` | Solidity coverage enforcement and access-control remapping.【F:.github/workflows/ci.yml†L492-L543】 |
| `phase6` | `ci (v2) / Phase 6 readiness` | Phase 6 scenario rehearse.【F:.github/workflows/ci.yml†L544-L574】 |
| `phase8` | `ci (v2) / Phase 8 readiness` | Phase 8 dominance rehearsal.【F:.github/workflows/ci.yml†L575-L605】 |
| `kardashev_demo` | `ci (v2) / Kardashev II readiness` | Kardashev II + Stellar demos.【F:.github/workflows/ci.yml†L606-L638】 |
| `asi_takeoff_demo` | `ci (v2) / ASI Take-Off Demonstration` | Autonomous take-off drill with artefacts.【F:.github/workflows/ci.yml†L639-L681】 |
| `zenith_demo` | `ci (v2) / Zenith Sapience Demonstration` | Deterministic + local Zenith sapience rehearsals.【F:.github/workflows/ci.yml†L682-L736】 |
| `agi_labor_market_demo` | `ci (v2) / AGI Labor Market Grand Demo` | Labour market transcript export.【F:.github/workflows/ci.yml†L737-L779】 |
| `sovereign_mesh_demo` | `ci (v2) / Sovereign Mesh Demo — build` | Sovereign mesh server + console build.【F:.github/workflows/ci.yml†L780-L817】 |
| `sovereign_constellation_demo` | `ci (v2) / Sovereign Constellation Demo — build` | Constellation orchestrator + console build.【F:.github/workflows/ci.yml†L818-L855】 |
| `celestial_archon_demo` | `ci (v2) / Celestial Archon Demonstration` | Celestial Archon deterministic + local rehearsals.【F:.github/workflows/ci.yml†L856-L910】 |
| `hypernova_demo` | `ci (v2) / Hypernova Governance Demonstration` | Hypernova deterministic + local rehearsals.【F:.github/workflows/ci.yml†L911-L965】 |
| `branch_protection` | `ci (v2) / Branch protection guard` | Live GitHub branch protection audit against manifests. Fork pull requests emit a bypass note yet leave the required context green so enforcement still lands on protected branches.【F:.github/workflows/ci.yml†L966-L1089】【F:ci/required-contexts.json†L1-L24】 |
| `summary` | `ci (v2) / CI summary` | Aggregates job outcomes, writes `reports/ci/status.{md,json}`, fails on missing artefacts or red jobs.【F:.github/workflows/ci.yml†L1000-L1130】 |
| `invariants` | `ci (v2) / Invariant tests` | Forge invariant harness with fuzz-runs 512.【F:.github/workflows/ci.yml†L1131-L1181】 |

The manifest lives in [`required-contexts.json`](required-contexts.json). `npm run ci:verify-contexts` validates that the workflow display names match this file before CI ever runs.【F:ci/required-contexts.json†L1-L24】【F:package.json†L135-L146】

## Companion workflows
| Workflow | Required job | Purpose |
| -------- | ------------ | ------- |
| `static-analysis` | `Slither static analysis` | Solidity static analysis with Slither guardrails.【F:ci/required-companion-contexts.json†L1-L3】 |
| `fuzz` | `forge-fuzz` | Dedicated Forge fuzzing outside the main CI cadence.【F:ci/required-companion-contexts.json†L1-L4】 |
| `webapp` | `webapp-ci` | Next.js console lint/build/test smoke.【F:ci/required-companion-contexts.json†L1-L5】 |
| `containers` | `build (node-runner)` / `build (validator-runner)` / `build (gateway)` / `build (webapp)` / `build (owner-console)` | Hardened container builds for every runtime surface.【F:ci/required-companion-contexts.json†L1-L9】 |
| `e2e` | `orchestrator-e2e` | Deterministic orchestrator E2E rehearsal.【F:ci/required-companion-contexts.json†L1-L11】 |

Use `npm run ci:verify-companion-contexts` to make sure the manifest stays synchronised with GitHub configuration.【F:package.json†L135-L146】

### Companion lattice visualised
```mermaid
flowchart TD
    classDef main fill:#ecfeff,stroke:#0369a1,color:#0f172a,stroke-width:1px;
    classDef companion fill:#fef3c7,stroke:#d97706,color:#7c2d12,stroke-width:1px;
    classDef checks fill:#f1f5f9,stroke:#1e293b,color:#0f172a,stroke-width:1px;

    ciSummary[ci (v2) / CI summary]:::main --> checksWall[GitHub checks wall]:::checks
    staticAnalysis[static-analysis / Slither static analysis]:::companion --> checksWall
    fuzzSuite[fuzz / forge-fuzz]:::companion --> checksWall
    webappCi[webapp / webapp-ci]:::companion --> checksWall
    containersNode[containers / build (node-runner)]:::companion --> checksWall
    containersValidator[containers / build (validator-runner)]:::companion --> checksWall
    containersGateway[containers / build (gateway)]:::companion --> checksWall
    containersWebapp[containers / build (webapp)]:::companion --> checksWall
    containersOwner[containers / build (owner-console)]:::companion --> checksWall
    e2eSuite[e2e / orchestrator-e2e]:::companion --> checksWall
```

Every arrow represents a required status entry on the pull-request checks wall. The `ci (v2) / CI summary` job aggregates the internal lattice, while the companion workflows deliver hardened linting, fuzzing, containers, and E2E rehearsals that branch protection refuses to ignore.【F:.github/workflows/ci.yml†L1000-L1130】【F:ci/required-companion-contexts.json†L1-L11】

## Branch protection automation
1. Dry-run the rule to inspect drift without applying changes:
   ```bash
   npm run ci:enforce-branch-protection -- --dry-run --branch main
   ```
2. Verify the live GitHub rule against the manifests (requires a fine-grained PAT with `administration:read` scope or a GitHub App token):
   ```bash
   GITHUB_TOKEN=<token> npm run ci:verify-branch-protection -- --owner MontrealAI --repo AGIJobsv0 --branch main
   ```
   The script fetches branch protection via the REST API, compares the enforced contexts to `required-contexts.json` and `required-companion-contexts.json`, and fails if any item is missing or out of order.【F:package.json†L138-L146】【F:scripts/ci/verify-branch-protection.ts†L1-L239】
3. Apply enforcement after reviewing the dry-run output:
   ```bash
   npm run ci:enforce-branch-protection -- --branch main
   ```
   The branch protection guard job uses the same manifests and fails the workflow if enforcement is misconfigured, keeping `main` locked to the manifest expectations while still succeeding on forked PRs that cannot call the admin API.【F:package.json†L135-L146】【F:.github/workflows/ci.yml†L966-L1089】

## Artefacts & forensic trail
- `reports/ci/status.{md,json}` – Consolidated run summary and JSON feed for downstream dashboards.【F:.github/workflows/ci.yml†L1000-L1130】
- `reports/owner-control/**` – Owner doctor, authority matrix, and parameter matrix outputs uploaded on every run.【F:.github/workflows/ci.yml†L393-L439】
- `reports/load-sim/**` – Monte Carlo CSV + JSON results for economic dissipation analysis.【F:.github/workflows/ci.yml†L216-L292】

## Local verification checklist
```bash
npm run ci:preflight               # Toolchain + lock enforcement
npm run ci:verify-toolchain        # Hardhat, Foundry, npm version parity
npm run ci:verify-contexts         # Required context manifest sync
npm run ci:verify-companion-contexts  # Companion workflow manifest sync
npm run ci:owner-authority -- --network ci --out reports/owner-control  # Authority matrix regeneration
```
Every command feeds directly into CI v2 so local runs reproduce the enforcement envelope.【F:package.json†L135-L149】【F:.github/workflows/ci.yml†L44-L543】

## Governance notes
- Keep Node.js (20.18.x) and npm (≥10.8.0 <11) aligned with `.nvmrc` and `package.json` engines before running scripts.【F:.nvmrc†L1-L1】【F:package.json†L121-L134】
- CI jobs harden the runner, cache deterministic artefacts, and upload evidence. Do not remove upload steps—branch protection will fail the run if artefacts are missing.【F:.github/workflows/ci.yml†L44-L439】【F:.github/workflows/ci.yml†L1000-L1130】
- Update `required-contexts.json` and `required-companion-contexts.json` whenever new jobs are introduced. The verification scripts and branch guard will block merges until the manifests and workflow stay in sync.【F:ci/required-contexts.json†L1-L24】【F:ci/required-companion-contexts.json†L1-L11】【F:.github/workflows/ci.yml†L966-L1181】
