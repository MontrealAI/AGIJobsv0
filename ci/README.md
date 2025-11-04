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

The `ci/` deck defines the manifest, verification scripts, and artefacts that keep AGI Jobs v0 (v2) permanently green. Required contexts here mirror the branch protection rule; automation in `.github/workflows/ci.yml` fails immediately when drift is detected, so release captains always see the full assurance wall.【F:.github/workflows/ci.yml†L22-L292】【F:.github/workflows/ci.yml†L970-L1155】

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
| `lint` | `ci (v2) / Lint & static checks` | Hardhat + TypeScript lint, manifest validation, toolchain lock enforcement.【F:.github/workflows/ci.yml†L34-L74】 |
| `tests` | `ci (v2) / Tests` | Contract compilation, test execution, ABI drift guard.【F:.github/workflows/ci.yml†L75-L117】 |
| `python_unit` | `ci (v2) / Python unit tests` | Paymaster, tools, orchestrator, and simulation unit analytics with coverage export.【F:.github/workflows/ci.yml†L118-L167】 |
| `python_integration` | `ci (v2) / Python integration tests` | API + demo integrations plus coverage export.【F:.github/workflows/ci.yml†L168-L215】 |
| `python_load_sim` | `ci (v2) / Load-simulation reports` | Monte Carlo sweeps writing CSV + JSON stress reports.【F:.github/workflows/ci.yml†L216-L292】 |
| `python_coverage` | `ci (v2) / Python coverage enforcement` | Combines analytics coverage sets and enforces thresholds.【F:.github/workflows/ci.yml†L293-L349】 |
| `hgm_guardrails` | `ci (v2) / HGM guardrails` | Node + Python governance regression suite.【F:.github/workflows/ci.yml†L350-L392】 |
| `owner_controls` | `ci (v2) / Owner control assurance` | Owner doctor, command center digest, and authority matrix regeneration.【F:.github/workflows/ci.yml†L393-L440】 |
| `foundry` | `ci (v2) / Foundry` | Forge fuzz testing for Solidity surface.【F:.github/workflows/ci.yml†L444-L494】 |
| `coverage` | `ci (v2) / Coverage thresholds` | Solidity coverage enforcement and access-control remapping.【F:.github/workflows/ci.yml†L496-L546】 |
| `phase6` | `ci (v2) / Phase 6 readiness` | Phase 6 scenario rehearse.【F:.github/workflows/ci.yml†L548-L577】 |
| `phase8` | `ci (v2) / Phase 8 readiness` | Phase 8 dominance rehearsal.【F:.github/workflows/ci.yml†L580-L608】 |
| `kardashev_demo` | `ci (v2) / Kardashev II readiness` | Kardashev II + Stellar demos.【F:.github/workflows/ci.yml†L610-L641】 |
| `asi_takeoff_demo` | `ci (v2) / ASI Take-Off Demonstration` | Autonomous take-off drill with artefacts.【F:.github/workflows/ci.yml†L644-L684】 |
| `zenith_demo` | `ci (v2) / Zenith Sapience Demonstration` | Deterministic + local Zenith sapience rehearsals.【F:.github/workflows/ci.yml†L686-L736】 |
| `agi_labor_market_demo` | `ci (v2) / AGI Labor Market Grand Demo` | Labour market transcript export.【F:.github/workflows/ci.yml†L742-L782】 |
| `sovereign_mesh_demo` | `ci (v2) / Sovereign Mesh Demo — build` | Sovereign mesh server + console build.【F:.github/workflows/ci.yml†L785-L819】 |
| `sovereign_constellation_demo` | `ci (v2) / Sovereign Constellation Demo — build` | Constellation orchestrator + console build.【F:.github/workflows/ci.yml†L822-L858】 |
| `celestial_archon_demo` | `ci (v2) / Celestial Archon Demonstration` | Celestial Archon deterministic + local rehearsals.【F:.github/workflows/ci.yml†L860-L910】 |
| `hypernova_demo` | `ci (v2) / Hypernova Governance Demonstration` | Hypernova deterministic + local rehearsals.【F:.github/workflows/ci.yml†L911-L965】 |
| `branch_protection` | `ci (v2) / Branch protection guard` | Live GitHub branch protection audit against manifests. Fork pull requests emit a bypass note yet leave the required context green so enforcement still lands on protected branches.【F:.github/workflows/ci.yml†L966-L1089】【F:ci/required-contexts.json†L1-L24】 |
| `summary` | `ci (v2) / CI summary` | Aggregates job outcomes, writes `reports/ci/status.{md,json}`, fails on missing artefacts or red jobs.【F:.github/workflows/ci.yml†L1026-L1155】 |
| `invariants` | `ci (v2) / Invariant tests` | Forge invariant harness with fuzz-runs 512.【F:.github/workflows/ci.yml†L1157-L1181】 |

The manifest lives in [`required-contexts.json`](required-contexts.json). `npm run ci:sync-contexts -- --check` ensures the JSON stays in lockstep with `ci.yml`, and `npm run ci:verify-contexts` validates the display names before CI ever runs.【F:ci/required-contexts.json†L1-L24】【F:package.json†L135-L146】【F:scripts/ci/update-ci-required-contexts.ts†L1-L83】

## Companion workflows
| Workflow | Required job | Purpose |
| -------- | ------------ | ------- |
| `static-analysis` | `Slither static analysis` | Solidity static analysis with Slither guardrails.【F:ci/required-companion-contexts.json†L1-L3】 |
| `fuzz` | `forge-fuzz` | Dedicated Forge fuzzing outside the main CI cadence.【F:ci/required-companion-contexts.json†L1-L4】 |
| `webapp` | `webapp-ci` | Next.js console lint/build/test smoke.【F:ci/required-companion-contexts.json†L1-L5】 |
| `containers` | `build (node-runner)` / `build (validator-runner)` / `build (gateway)` / `build (webapp)` / `build (owner-console)` | Hardened container builds for every runtime surface.【F:ci/required-companion-contexts.json†L1-L9】 |
| `e2e` | `orchestrator-e2e` | Deterministic orchestrator E2E rehearsal.【F:ci/required-companion-contexts.json†L1-L11】 |

Use `npm run ci:sync-contexts -- --check` followed by `npm run ci:verify-companion-contexts` to make sure the manifest stays synchronised with GitHub configuration; run `npm run ci:sync-contexts` without `--check` when you intentionally add or rename jobs so the JSON is regenerated deterministically.【F:package.json†L135-L146】【F:scripts/ci/update-ci-required-contexts.ts†L1-L83】

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

Every arrow represents a required status entry on the pull-request checks wall. The `ci (v2) / CI summary` job aggregates the internal lattice, while the companion workflows deliver hardened linting, fuzzing, containers, and E2E rehearsals that branch protection refuses to ignore.【F:.github/workflows/ci.yml†L1026-L1155】【F:ci/required-companion-contexts.json†L1-L11】

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

### Enforcement feedback loop

```mermaid
flowchart TD
    classDef manifest fill:#e0f2fe,stroke:#0284c7,color:#0f172a,stroke-width:1px;
    classDef cli fill:#ecfdf5,stroke:#10b981,color:#064e3b,stroke-width:1px;
    classDef guard fill:#fef3c7,stroke:#d97706,color:#7c2d12,stroke-width:1px;
    classDef reports fill:#f1f5f9,stroke:#1e293b,color:#0f172a,stroke-width:1px;

    manifests[ci/required-contexts.json + ci/required-companion-contexts.json]:::manifest --> sync[ci:sync-contexts]:::cli
    sync --> verify[ci:verify-contexts / ci:verify-companion-contexts]:::cli
    verify --> guardJob[ci (v2) / Branch protection guard]:::guard
    guardJob --> githubRule[GitHub branch protection rule]:::guard
    githubRule --> summaryJob[ci (v2) / CI summary]:::guard
    summaryJob --> artefacts[reports/ci/status.{md,json}]:::reports
    artefacts --> oncall[On-call + release captains]:::cli
    artefacts --> dashboards[External dashboards]:::reports
```

Verification scripts, branch protection, and the `CI summary` job form a closed loop: manifests are regenerated locally, enforced via GitHub API calls, and audited in CI so on-call operators always consume up-to-date artefacts.【F:scripts/ci/update-ci-required-contexts.ts†L1-L83】【F:scripts/ci/verify-branch-protection.ts†L1-L239】【F:.github/workflows/ci.yml†L1026-L1155】

## Live status wall verification
- Confirm the latest production signal before shipping by running `npm run ci:status-wall -- --token <github_token>`. The script hits the GitHub Actions API, checks every `ci (v2)` job listed in [`ci/required-contexts.json`](required-contexts.json), and prints a ✅/⚠️ breakdown with deep links. Add `--format markdown` for README-ready tables or `--format json` when exporting structured data for dashboards or automated gatekeeping.【F:scripts/ci/check-ci-status-wall.ts†L73-L100】【F:scripts/ci/check-ci-status-wall.ts†L312-L387】
- Add `--include-companion` when you want the static analysis, fuzz, webapp, containers, and e2e workflows verified in the same sweep. Each companion manifest entry is grouped by workflow, and the command fails fast when any job drops below green.
- Override `--branch` or `--workflow` for release branches or bespoke CI environments; all options mirror the enforcement logic in the branch protection guard so local validation matches the automation running on `main`.

```bash
$ npm run ci:status-wall -- --token $GITHUB_TOKEN --require-success --include-companion
✅ ci (v2) / Lint & static checks — success
✅ ci (v2) / Tests — success
...
✅ containers / build (owner-console) — success
Summary written to reports/ci/status.json and reports/ci/status.md
```

Use `--format markdown`, `--format json`, or the default text mode to control the output layout; the CLI always mirrors the enforcement logic in `ci (v2) / Branch protection guard`, so a green local report guarantees a green GitHub wall.【F:scripts/ci/check-ci-status-wall.ts†L73-L100】【F:scripts/ci/check-ci-status-wall.ts†L312-L387】【F:.github/workflows/ci.yml†L966-L1089】

### Status feed integration

```mermaid
flowchart TD
    classDef artefact fill:#ecfeff,stroke:#0369a1,color:#0f172a,stroke-width:1px;
    classDef cli fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95,stroke-width:1px;
    classDef downstream fill:#f1f5f9,stroke:#1e293b,color:#0f172a,stroke-width:1px;

    summaryJob[ci (v2) / CI summary]:::cli --> jsonFeed[reports/ci/status.json]:::artefact
    summaryJob --> markdownFeed[reports/ci/status.md]:::artefact
    jsonFeed --> grafana[Grafana / Looker / Metabase decks]:::downstream
    markdownFeed --> briefings[Daily briefings & PR templates]:::downstream
    cliProbe[npm run ci:status-wall]:::cli --> jsonFeed
```

- `ci (v2) / CI summary` writes `reports/ci/status.{json,md}` on every run, then uploads them as artefacts alongside the workflow logs so downstream dashboards can consume the data without custom scrapers.【F:.github/workflows/ci.yml†L1026-L1155】
- `npm run ci:status-wall -- --format json` reproduces the feed locally, letting you wire the same data into compliance sign-offs, data warehouses, or release management bots before merge. Pair it with `--format markdown` to cut-and-paste the latest wall into READMEs or governance briefings.【F:scripts/ci/check-ci-status-wall.ts†L73-L100】【F:scripts/ci/check-ci-status-wall.ts†L312-L387】
- The JSON payload includes job URLs and pass/fail metadata, making it trivial to colour live dashboards or send webhooks when any part of the assurance wall drops below green.【F:.github/workflows/ci.yml†L1026-L1155】【F:scripts/ci/check-ci-status-wall.ts†L200-L332】

## Artefacts & forensic trail
- `reports/ci/status.{md,json}` – Consolidated run summary and JSON feed for downstream dashboards.【F:.github/workflows/ci.yml†L1026-L1155】
- `reports/owner-control/**` – Owner doctor, authority matrix, command center digest, and parameter matrix outputs uploaded on every run.【F:.github/workflows/ci.yml†L393-L440】
- `reports/load-sim/**` – Monte Carlo CSV + JSON results for economic dissipation analysis.【F:.github/workflows/ci.yml†L216-L292】

## Local verification checklist
```bash
npm run ci:preflight               # Toolchain + lock enforcement
npm run ci:verify-toolchain        # Hardhat, Foundry, npm version parity
npm run ci:sync-contexts -- --check # Ensure ci/required-contexts.json matches ci.yml
npm run ci:verify-contexts         # Required context manifest sync
npm run ci:verify-companion-contexts  # Companion workflow manifest sync
npm run ci:owner-authority -- --network ci --out reports/owner-control  # Authority matrix regeneration
```
Every command feeds directly into CI v2 so local runs reproduce the enforcement envelope.【F:package.json†L135-L149】【F:.github/workflows/ci.yml†L34-L546】

## Governance notes
- Keep Node.js (20.18.x) and npm (≥10.8.0 <11) aligned with `.nvmrc` and `package.json` engines before running scripts.【F:.nvmrc†L1-L1】【F:package.json†L121-L134】
- CI jobs harden the runner, cache deterministic artefacts, and upload evidence. Do not remove upload steps—branch protection will fail the run if artefacts are missing.【F:.github/workflows/ci.yml†L34-L440】【F:.github/workflows/ci.yml†L1026-L1155】
- Update `required-contexts.json` and `required-companion-contexts.json` whenever new jobs are introduced. Prefer `npm run ci:sync-contexts` to regenerate the main manifest; the verification scripts and branch guard will block merges until both JSON manifests align with the workflow.【F:ci/required-contexts.json†L1-L24】【F:ci/required-companion-contexts.json†L1-L11】【F:package.json†L135-L146】【F:scripts/ci/update-ci-required-contexts.ts†L1-L83】【F:.github/workflows/ci.yml†L966-L1181】
