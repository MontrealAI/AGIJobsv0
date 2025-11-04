# AGI Jobs v0 (v2)

[![CI (v2)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)
[![CI (v2) job wall](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main&job=CI%20summary)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml?query=workflow%3A%22ci+%28v2%29%22+is%3Asuccess+branch%3Amain)
[![Static Analysis](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/static-analysis.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/static-analysis.yml)
[![Fuzz](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/fuzz.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/fuzz.yml)
[![Webapp](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/webapp.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/webapp.yml)
[![Containers](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/containers.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/containers.yml)
[![Orchestrator](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/orchestrator-ci.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/orchestrator-ci.yml)
[![E2E](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/e2e.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/e2e.yml)
[![Security Scorecard](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/scorecard.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/scorecard.yml)

AGI Jobs v0 (v2) operates as the unified intelligence engine for the ecosystem—an always-on command lattice that synthesises agents, contracts, paymasters, orchestrators, simulations, and demos into a single, production-grade surface. Every subsystem is instrumented, audit-backed, and continuously enforced by CI v2 so launch captains treat `main` as deployable truth. Ownership is never ceded: the contract owner wields deterministic control over all vectors (pausing, upgrades, economic parameters, orchestration mesh, telemetry exports) through the verified command center described below.

```mermaid
flowchart LR
    classDef core fill:#f3e8ff,stroke:#7c3aed,color:#2e1065,stroke-width:1px;
    classDef guard fill:#dcfce7,stroke:#16a34a,color:#14532d,stroke-width:1px;
    classDef ops fill:#e0f2fe,stroke:#0284c7,color:#0c4a6e,stroke-width:1px;
    classDef owner fill:#fef3c7,stroke:#d97706,color:#7c2d12,stroke-width:1px;

    OwnerConsole[[Owner command center CLI]]:::owner --> AuthorityMatrix[Owner authority matrix<br/>`npm run owner:verify-control`]:::guard
    AuthorityMatrix --> Contracts{{Contracts + Paymasters}}:::core
    Contracts --> Agents{{Agent gateway & orchestrators}}:::core
    Agents --> Demos{{Demonstration suites + simulations}}:::core
    Demos --> Observability[[Observability fabric<br/>`reports/**`]]:::ops
    Observability --> CIStatus[[CI v2 status wall]]:::guard
    CIStatus --> BranchProtection[[Branch protection guard]]:::guard
    BranchProtection --> OwnerConsole
```

The loop above is enforced in automation: CI v2 verifies the owner authority manifests, generates telemetry artefacts, and blocks merges when anything drifts. Operators inherit a continuously self-auditing intelligence platform rather than a loose toolkit.

## Documentation lattice

The repository’s manuals, runbooks, and subsystem READMEs are catalogued in [`docs/readme-catalog.md`](docs/readme-catalog.md). The inventory spans 169 markdown guides (129 READMEs, 40 runbooks) so release captains can locate operator instructions, demo briefings, and subsystem diagrams without spelunking through the tree. Every document is synchronised with the repository tree; CI fails fast if a referenced README is missing, keeping the narrative aligned with the code that powers it.【F:docs/readme-catalog.md†L1-L71】【F:docs/readme-catalog.md†L73-L169】【F:.github/workflows/ci.yml†L34-L1181】

```mermaid
mindmap
  root((Knowledge lattice))
    Operator runbooks
      OperatorRunbook.md
      RUNBOOK.md
      Operator console quickstarts
    Intelligence dossiers
      docs/AUDIT_DOSSIER.md
      docs/AGI_Jobs_v0_Whitepaper_v2.md
      docs/legal-regulatory.md
    CI manifest
      ci/README.md
      docs/status-wall.md
      reports/ci/status.md
    Owner authority
      scripts/v2/ownerControl*.ts
      reports/owner-control/**
```

Use the catalogue to jump directly into any subsystem; the documents are regenerated whenever directories shift so the map never falls out of sync with the codebase.

## Owner command authority

The contract owner maintains unilateral, auditable control over the entire platform. Every command emits deterministic artefacts (`reports/owner-control/**`) and is enforced by CI so branch protection never accepts a regression.

| Capability | Command | Output |
| ---------- | ------- | ------ |
| Prove governance posture | `npm run owner:verify-control` | Authority matrix, role bindings, guardian quorum reports.【F:package.json†L365-L397】【F:.github/workflows/ci.yml†L393-L440】 |
| Pause or resume execution | `npm run owner:system-pause` / `npm run owner:emergency` | Transaction scripts + pause certificates ready for multisig execution.【F:package.json†L376-L390】【F:scripts/v2/systemPauseAction.ts†L1-L162】 |
| Reconfigure parameters | `npm run owner:parameters` | Parameter matrix CSV/JSON for rapid reprogramming across contracts, agents, and paymasters.【F:package.json†L381-L383】【F:scripts/v2/ownerParameterMatrix.ts†L1-L210】 |
| Stage upgrades | `npm run owner:upgrade` / `npm run owner:upgrade-status` | Upgrade queue diffs, bytecode fingerprints, upgrade state proofs.【F:package.json†L393-L396】【F:scripts/v2/ownerUpgradeQueue.ts†L1-L188】 |
| Generate dashboards | `npm run owner:dashboard` / `npm run owner:command-center` | Owner dashboards, command plans, and compliance briefings for non-technical operators.【F:package.json†L372-L375】【F:scripts/v2/ownerCommandCenter.ts†L1-L212】 |

Every CLI entrypoint is safe to execute from air-gapped control rooms or automated pipelines; commands support `--out` targets so artefacts can be archived alongside governance approvals. Combine them with `npm run owner:plan:safe` to produce multisig-ready transaction bundles when deploying from custodial safes.【F:package.json†L381-L385】【F:scripts/v2/run-owner-plan.js†L1-L118】

```mermaid
sequenceDiagram
    participant Owner
    participant CommandCenter as Owner command center
    participant Ledger as Contracts & paymasters
    participant Guardians as Multisig / guardian set
    participant CI as CI v2 guard

    Owner->>CommandCenter: Trigger owner:* command
    CommandCenter->>Ledger: Prepare signed transaction set
    Ledger-->>CommandCenter: Emit state proofs + receipts
    CommandCenter->>Guardians: Publish approval packets / safe bundle
    CommandCenter->>CI: Upload authority artefacts
    CI-->>Owner: Gate merge until verification passes
```

The resulting artefacts feed the `Owner control assurance` CI job and the branch protection guard so every production deployment is traceable back to an approved owner command path.【F:.github/workflows/ci.yml†L393-L440】【F:.github/workflows/ci.yml†L970-L1089】

## CI v2 status wall (live)

The full mapping between wall entries, workflow job identifiers, and maintenance steps lives in [`docs/status-wall.md`](docs/status-wall.md). The wall is enforced twice: GitHub branch protection consumes `ci/required-contexts.json`, and the `CI summary` job fails fast when any upstream signal degrades. Release captains regenerate the wall locally with `npm run ci:status-wall -- --require-success --include-companion --format markdown` so this table mirrors the live GitHub truth at all times.【F:ci/README.md†L19-L129】【F:scripts/ci/check-ci-status-wall.ts†L73-L210】

| Required job | Status badge |
| ------------ | ------------ |
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

Companion workflows complete the assurance wall: [static analysis](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/static-analysis.yml), [fuzz](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/fuzz.yml), [webapp](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/webapp.yml), [containers](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/containers.yml), and [e2e](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/e2e.yml). Required contexts for those workflows are defined in [`ci/required-companion-contexts.json`](ci/required-companion-contexts.json) and enforced by `npm run ci:verify-companion-contexts`.

### Live verification CLI
- Run `npm run ci:status-wall -- --token <github_token>` to confirm the latest `ci (v2)` run on `main` succeeded across every required job. The command inspects the GitHub Actions API, flags missing or red jobs, and prints a breakdown with direct links to each job log. Add `--format markdown` to render a README-ready table or `--format json` when you need structured output for dashboards or automated release gates.【F:scripts/ci/check-ci-status-wall.ts†L73-L100】【F:scripts/ci/check-ci-status-wall.ts†L312-L387】
- Pass `--include-companion` to extend the check across the companion workflows (static-analysis, fuzz, webapp, containers, e2e) so the full assurance wall is verified in one sweep.【F:scripts/ci/check-ci-status-wall.ts†L262-L332】【F:ci/required-companion-contexts.json†L1-L10】
- Use `--branch <name>` or `--workflow <file>` when validating release branches or pre-flight changes in forks. All options mirror the automation that the branch-protection guard enforces on protected branches.【F:scripts/ci/check-ci-status-wall.ts†L200-L332】

| Scenario | Command | Notes |
| --- | --- | --- |
| Enforce success on `main` | `npm run ci:status-wall -- --token $GITHUB_TOKEN --require-success` | Fails fast unless every job finished in `success` or `skipped` state.【F:scripts/ci/check-ci-status-wall.ts†L93-L199】 |
| Include companion lattice | `npm run ci:status-wall -- --token $GITHUB_TOKEN --include-companion` | Adds static-analysis, fuzz, webapp, containers, and e2e to the report.【F:scripts/ci/check-ci-status-wall.ts†L262-L332】 |
| Export dashboards | `npm run ci:status-wall -- --token $GITHUB_TOKEN --format json > reports/ci/status.wall.json` | Emits machine-readable payload for dashboards and alerting.【F:scripts/ci/check-ci-status-wall.ts†L312-L387】 |
| Refresh README table | `npm run ci:status-wall -- --token $GITHUB_TOKEN --format markdown > reports/ci/status-wall.md` | Generates a GitHub-flavoured table matching the live status wall for direct embedding.【F:scripts/ci/check-ci-status-wall.ts†L73-L100】【F:scripts/ci/check-ci-status-wall.ts†L312-L387】 |

```mermaid
flowchart TD
    classDef entry fill:#0ea5e9,stroke:#0284c7,color:#f8fafc,stroke-width:1px;
    classDef api fill:#6366f1,stroke:#312e81,color:#e0e7ff,stroke-width:1px;
    classDef guard fill:#facc15,stroke:#ca8a04,color:#1e1b4b,stroke-width:1px;
    classDef artefact fill:#10b981,stroke:#064e3b,color:#f0fdf4,stroke-width:1px;

    statusWall["ci:status-wall CLI\n(Operator command)"]:::entry --> ghRuns["GitHub Actions\nruns API"]:::api
    statusWall --> ghJobs["GitHub Actions\njobs API"]:::api
    ghRuns --> manifest["ci/required-contexts.json\n(required wall)"]:::guard
    ghJobs --> companion["ci/required-companion-contexts.json\n(companion wall)"]:::guard
    manifest --> verdict["Branch protection guard\nparity check"]:::guard
    companion --> verdict
    verdict --> artefacts["reports/ci/status.{md,json}\nmission artefacts"]:::artefact
```

The same manifest powers the branch-protection guard inside CI v2 and the local verification CLI, so green walls locally guarantee green walls on GitHub before merge.【F:.github/workflows/ci.yml†L966-L1089】【F:ci/required-contexts.json†L1-L24】

### Double-green enforcement drill
1. **Interrogate the wall:** `npm run ci:status-wall -- --token <github_token> --require-success --include-companion` must return all ✅ lines and regenerate both Markdown and JSON artefacts in `reports/ci/`. Cross-check the printed run ID with the Actions UI so the command and GitHub agree on the latest passing workflow.【F:scripts/ci/check-ci-status-wall.ts†L73-L100】【F:scripts/ci/check-ci-status-wall.ts†L312-L387】
2. **Lock the manifest:** Immediately execute `npm run ci:sync-contexts -- --check` to prove that the required context manifest still mirrors `.github/workflows/ci.yml`. The command fails fast on any drift so branch protection cannot silently fall behind.【F:scripts/ci/update-ci-required-contexts.ts†L1-L83】【F:ci/required-contexts.json†L1-L24】
3. **Audit the rule:** Finish with `npm run ci:verify-branch-protection -- --owner MontrealAI --repo AGIJobsv0 --branch main --require` and archive the console output. The script queries the GitHub REST API and enforces parity with the manifest, so a single invocation validates CI status, manifests, and the live protection rule in one sweep.【F:scripts/ci/verify-branch-protection.ts†L1-L239】

```mermaid
flowchart TD
    classDef cli fill:#ecfeff,stroke:#0369a1,color:#0f172a,stroke-width:1px;
    classDef api fill:#f1f5f9,stroke:#1e293b,color:#0f172a,stroke-width:1px;
    classDef guard fill:#fefce8,stroke:#ca8a04,color:#713f12,stroke-width:1px;
    classDef artefact fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95,stroke-width:1px;

    statusCLI[ci:status-wall]:::cli --> ghRunsAPI[GitHub Actions runs API]:::api
    statusCLI --> statusArtefacts[reports/ci/status.{md,json}]:::artefact
    manifestCheck[ci:sync-contexts --check]:::cli --> workflowFile[.github/workflows/ci.yml]:::guard
    manifestCheck --> manifestJSON[ci/required-contexts.json]:::guard
    branchAudit[ci:verify-branch-protection]:::cli --> githubBranchAPI[GitHub branch protection API]:::api
    manifestJSON --> branchAudit
    workflowFile --> branchAudit
    branchAudit --> enforcementReceipt[Archived enforcement log]:::artefact
```

Running the drill before every release forces status verification, manifest locking, and branch protection auditing to agree, creating a triple-check loop that mirrors CI v2’s internal guard rails.【F:.github/workflows/ci.yml†L1026-L1155】【F:ci/required-contexts.json†L1-L24】

## Executive signal
- **Unification:** Smart contracts, agent gateways, demos, and analytics are orchestrated as one lattice, keeping governance, telemetry, and delivery in lockstep for non-technical operators.【F:agent-gateway/README.md†L1-L53】【F:apps/validator-ui/README.md†L1-L40】【F:services/thermostat/README.md†L1-L60】
- **Owner supremacy:** Every critical lever is surfaced through deterministic owner tooling so the contract owner can pause, upgrade, and retune parameters on demand, without redeploying or editing code.【F:contracts/v2/admin/OwnerConfigurator.sol†L7-L112】【F:package.json†L135-L226】
- **Evergreen assurance:** CI v2 enforces a wall of 23 required contexts plus companion workflows, uploads audit artefacts, and verifies branch protection so every release inherits a fully green, enforceable policy.【F:.github/workflows/ci.yml†L22-L965】【F:.github/workflows/ci.yml†L970-L1181】【F:ci/required-contexts.json†L1-L24】【F:ci/required-companion-contexts.json†L1-L11】

## Owner dominion console
The platform’s operator CLI renders full-spectrum control to the contract owner without touching Solidity or TypeScript. Each command combines deterministic manifests from [`config/`](config/README.md) with the governance façades inside [`contracts/v2/admin`](contracts/README.md) so pauses, treasury updates, and validator quotas can be reconfigured in minutes while CI records immutable artefacts.【F:config/README.md†L1-L117】【F:contracts/README.md†L38-L80】【F:.github/workflows/ci.yml†L393-L443】

```mermaid
flowchart LR
    classDef deck fill:#f0f9ff,stroke:#0ea5e9,color:#0c4a6e,stroke-width:1px;
    classDef manifest fill:#ecfdf5,stroke:#10b981,color:#064e3b,stroke-width:1px;
    classDef contract fill:#ede9fe,stroke:#7c3aed,color:#4c1d95,stroke-width:1px;
    classDef ci fill:#fef3c7,stroke:#d97706,color:#7c2d12,stroke-width:1px;

    manifests[config manifests]:::manifest --> ownerCli[owner:* CLI deck]:::deck
    ownerCli --> configurator[OwnerConfigurator<br/>+ owner-control scripts]:::contract
    ownerCli --> pauseSwitch[SystemPause<br/>+ thermostat orchestration]:::contract
    configurator --> ciArtefacts[CI owner assurance<br/>artefacts]:::ci
    pauseSwitch --> ciArtefacts
```

| Command | Capability | Execution surface |
| ------- | ---------- | ----------------- |
| `npm run owner:parameters -- --network <net>` | Regenerates the full fee, treasury, validator, and thermostat matrix that CI stores under `reports/owner-control/`, ensuring executives can validate every toggle before signing transactions.【F:scripts/v2/ownerParameterMatrix.ts†L1-L612】【F:.github/workflows/ci.yml†L420-L439】 | Owner CLI + CI artefact wall |
| `npm run owner:system-pause -- --network <net>` | Emits pause/unpause calldata, previews the transaction JSON, and enforces module ownership so a single command can freeze or resume the lattice safely.【F:scripts/v2/systemPauseAction.ts†L1-L289】【F:contracts/v2/SystemPause.sol†L15-L157】 | Owner CLI |
| `npm run owner:update-all -- --network <net>` | Applies manifest diffs through `OwnerConfigurator` with dependency ordering and dry-run previews, matching the upgrades rehearsed in CI’s owner assurance job.【F:scripts/v2/updateAllModules.ts†L1-L1233】【F:.github/workflows/ci.yml†L393-L439】 | Owner CLI + CI |
| `npm run ci:owner-authority -- --network <net> --out reports/owner-control` | Regenerates Markdown/JSON authority matrices so the contract owner and auditors both see a living, CI-backed digest of who controls every lever.【F:package.json†L135-L226】【F:.github/workflows/ci.yml†L420-L439】 | CI pipelines + local drill |

The same commands run automatically in the `Owner control assurance` job, so the checks wall refuses a merge unless the owner retains total dominion over pause switches, treasury routing, and upgrade paths.【F:.github/workflows/ci.yml†L393-L443】

## Quickstart for operators
1. Use Node.js 20.18.1 (`.nvmrc`) and Python 3.12 to match the automated toolchain.【F:.nvmrc†L1-L1】【F:.github/workflows/ci.yml†L118-L145】
2. Hydrate dependencies (do **not** omit optional packages—the Hardhat toolbox requires the platform-specific `@nomicfoundation/solidity-analyzer-*` binary and will fail exactly like CI if you pass `--omit=optional`):
   ```bash
   npm install
   python -m pip install --upgrade pip
   python -m pip install -r requirements-python.txt
   ```
3. Confirm the deterministic toolchain locks before coding:
   ```bash
   npm run ci:preflight
   npm run ci:verify-toolchain
   npm run ci:sync-contexts -- --check
   npm run ci:verify-contexts
   npm run ci:verify-companion-contexts
   npm run ci:verify-summary-needs
   ```
   The sync command confirms `ci/required-contexts.json` matches the workflow before the verification scripts enforce ordering, and the summary check proves the wall coverage is intact—keeping this quintet green locally mirrors branch protection expectations.【F:package.json†L135-L150】【F:scripts/ci/update-ci-required-contexts.ts†L1-L83】【F:scripts/ci/check-summary-needs.js†L1-L79】【F:.github/workflows/ci.yml†L34-L74】【F:.github/workflows/ci.yml†L1009-L1077】
4. Validate the critical suites (prime the Hardhat cache once so local runs mirror CI performance):
   ```bash
   npm run compile           # generates artifacts exactly like the tests job
   npm test                  # reuses the compiled artefacts, matching ci (v2) / Tests
   npm run lint:ci
   npm run coverage
   forge test -vvvv --ffi --fuzz-runs 256
   ```
   Compiling first avoids the local fallback where `hardhat test --no-compile` triggers a fresh Solidity build, bringing the experience in line with the workflow’s dedicated compile step before `npm test`. These commands reproduce the Hardhat, linting, coverage, and Foundry stages the pipeline requires.【F:package.json†L233-L245】【F:.github/workflows/ci.yml†L75-L546】
   The Python coverage harness additionally exercises the HGM worker dispatcher and sharded simulation CLI so CI’s 85% gate reflects the orchestrator workloads developers rehearse locally.【F:test/orchestrator/test_worker.py†L1-L41】【F:test/simulation/test_harness.py†L1-L19】【F:test/simulation/test_sharded_simulation.py†L1-L68】
5. When the signal is green, push signed commits and open a pull request—CI v2 enforces the exact same contexts on `main` and PRs.

## Repository atlas
```mermaid
flowchart LR
    classDef core fill:#0ea5e9,stroke:#0369a1,color:#f8fafc,stroke-width:1px;
    classDef ops fill:#6366f1,stroke:#312e81,color:#eef2ff,stroke-width:1px;
    classDef demos fill:#f97316,stroke:#9a3412,color:#fff7ed,stroke-width:1px;
    classDef svc fill:#22c55e,stroke:#166534,color:#ecfdf5,stroke-width:1px;

    contracts[contracts/]:::core --> ci[ci/]:::ops
    contracts --> contractsOwner[contracts/v2/admin/]:::core
    agentGateway[agent-gateway/]:::svc --> services[services/]:::svc
    apps[apps/]:::svc --> demos[demo/]:::demos
    backend[backend/]:::svc --> deploy[deploy/]:::ops
    docs[docs/]:::ops --> reports[reports/]:::ops
    ci --> workflows[.github/workflows/]:::ops
    demos --> orchestrator[orchestrator/]:::svc
    ownerScripts[scripts/v2/]:::ops --> contractsOwner
    ownerScripts --> workflows
```

| Domain | Highlights |
| ------ | ---------- |
| Contracts (`contracts/`) | Solidity kernel, modules, admin façades, and invariant harnesses tested through Hardhat + Foundry with owner-first controls.【F:contracts/README.md†L1-L82】 |
| Agent Gateway (`agent-gateway/`) | TypeScript service providing REST, WebSocket, and gRPC bridges into the contract stack with deterministic telemetry exports.【F:agent-gateway/README.md†L1-L86】 |
| Apps (`apps/`) | Operator and validator UIs that consume the gateway and orchestrator APIs for mission dashboards.【F:apps/validator-ui/README.md†L1-L40】 |
| Services (`services/`) | Sentinels, thermostat, culture indexers, and auxiliary control planes feeding observability and safeguards.【F:services/thermostat/README.md†L1-L60】 |
| CI (`ci/` + `.github/workflows/`) | Scripts, manifests, and workflows that lock toolchains, enforce branch protection, and publish compliance artefacts.【F:ci/required-contexts.json†L1-L24】【F:.github/workflows/ci.yml†L24-L546】 |
| Demo constellation (`demo/`) | High-stakes rehearsals (Kardashev, ASI take-off, Zenith sapience, etc.) codified as reproducible scripts and UI bundles.【F:.github/workflows/ci.yml†L548-L965】 |

### Control-plane architecture

```mermaid
flowchart TD
    classDef entry fill:#0ea5e9,stroke:#0284c7,color:#f8fafc,stroke-width:1px;
    classDef contract fill:#6366f1,stroke:#312e81,color:#eef2ff,stroke-width:1px;
    classDef service fill:#f97316,stroke:#9a3412,color:#fff7ed,stroke-width:1px;
    classDef ci fill:#22c55e,stroke:#166534,color:#ecfdf5,stroke-width:1px;

    subgraph Operator Surface
        gateway[Agent gateway APIs]:::service
        consoles[Operator consoles (`apps/`)]:::service
        ownerDeck[Owner CLI + control scripts]:::entry
    end

    subgraph Intelligence Core
        contractsStack[Contracts kernel + modules]:::contract
        orchestratorSvc[Orchestrator services]:::service
        sentinels[Sentinel & thermostat services]:::service
    end

    subgraph Assurance Lattice
        ciMain[CI v2 pipelines]:::ci
        companion[Companion workflows]:::ci
        reports[Audit & CI reports]:::ci
        branchGuard[Branch protection guard]:::ci
    end

    ownerDeck --> gateway
    ownerDeck --> orchestratorSvc
    consoles --> gateway
    gateway --> contractsStack
    orchestratorSvc --> contractsStack
    sentinels --> orchestratorSvc
    sentinels --> reports
    ciMain --> reports
    companion --> reports
    branchGuard --> reports
    reports --> ownerDeck
    reports --> consoles
```

The control plane ties owners, operators, and automation into one verifiable surface: owners drive changes through deterministic CLI entry points, agent services marshal those commands into contract-safe transactions, and sentinel services plus CI pipelines export signed artefacts for audits.【F:package.json†L138-L215】【F:agent-gateway/README.md†L1-L86】【F:services/sentinel/README.md†L1-L67】【F:services/thermostat/README.md†L1-L60】

## Owner command authority
```mermaid
flowchart TD
    classDef owner fill:#fefce8,stroke:#ca8a04,color:#713f12,stroke-width:1px;
    classDef script fill:#ecfdf5,stroke:#10b981,color:#064e3b,stroke-width:1px;
    classDef contract fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,stroke-width:1px;

    Owner((Contract Owner)):::owner --> CommandCenter[owner:command-center]:::script
    CommandCenter --> OwnerConfigurator[[OwnerConfigurator]]:::contract
    Owner --> OwnerUpdate[owner:update-all]:::script --> Registry[[JobRegistry]]:::contract
    Owner --> OwnerPause[owner:system-pause]:::script --> SystemPause[[SystemPause]]:::contract
    Owner --> Authority[ci:owner-authority]:::script --> Matrix[(Owner authority matrix)]:::contract
```

| Command | Purpose |
| ------- | ------- |
| `npm run owner:system-pause -- --network <network>` | Toggle pause levers across kernel and module contracts in one transaction, enforcing ownership checks before execution.【F:package.json†L180-L195】【F:contracts/v2/SystemPause.sol†L15-L157】 |
| `npm run owner:update-all -- --network <network>` | Reconcile manifests against on-chain parameters through the `OwnerConfigurator`, emitting structured audit logs per change.【F:package.json†L195-L215】【F:contracts/v2/admin/OwnerConfigurator.sol†L7-L112】 |
| `npm run owner:command-center` | Render a consolidated mission-control report (mermaid + JSON) so non-technical owners can approve operations before broadcasting.【F:package.json†L165-L190】 |
| `npm run owner:parameters -- --network <network>` | Export the full parameter matrix referenced in CI and compliance reviews.【F:package.json†L165-L208】【F:scripts/v2/ownerParameterMatrix.ts†L1-L612】 |
| `npm run ci:owner-authority -- --network ci --out reports/owner-control` | Regenerate the authority matrix consumed by CI artefacts and branch protection guards.【F:package.json†L138-L149】【F:.github/workflows/ci.yml†L393-L440】 |

Every command supports `--dry-run` and report exports, ensuring the contract owner retains absolute control while the automation stays auditable.【F:scripts/v2/ownerControlDoctor.ts†L1-L252】【F:scripts/v2/ownerControlQuickstart.ts†L1-L220】

### Attestation registry safety lever

- `AttestationRegistry.pause()` / `unpause()` — owner-only circuit breaker that halts ENS-backed delegation while responding to compromised subdomains. Use the OwnerConfigurator (`owner:update-all`) or Hardhat console to invoke the pause, then resume once the attestor set is remediated. The mutation path is guarded by OpenZeppelin `Ownable` + `Pausable`, and attestation calls revert with `Pausable: paused` until unpaused.【F:contracts/v2/AttestationRegistry.sol†L11-L108】

### Governance oversight loop

```mermaid
flowchart LR
    classDef actor fill:#fefce8,stroke:#ca8a04,color:#713f12,stroke-width:1px;
    classDef auto fill:#ecfdf5,stroke:#10b981,color:#064e3b,stroke-width:1px;
    classDef guard fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,stroke-width:1px;
    classDef repo fill:#f1f5f9,stroke:#1e293b,color:#0f172a,stroke-width:1px;

    OwnerCouncil((Owner council)):::actor --> ControlDoctor[Owner control doctor]:::auto
    ControlDoctor --> AuthorityMatrix[(Owner authority matrix)]:::guard
    AuthorityMatrix --> BranchGuard[Branch protection guard]:::guard
    BranchGuard --> GitHub[GitHub branch protection]:::repo
    GitHub --> CIWall[ci (v2) / CI summary]:::guard
    CIWall --> Reports[reports/ci/status.{md,json}]:::repo
    Reports --> OwnerCouncil
    Reports --> Operators[Operator consoles]:::auto
```

The governance loop keeps owner supremacy verifiable: owner council scripts regenerate the authority matrix, CI v2 enforces branch protection parity, and the resulting artefacts cycle back into operator consoles and decision briefings.【F:.github/workflows/ci.yml†L393-L1155】【F:reports/audit/README.md†L1-L76】【F:scripts/v2/ownerControlDoctor.ts†L1-L252】

## Parameter recalibration pipeline
```mermaid
flowchart LR
    classDef inputs fill:#ecfeff,stroke:#0369a1,color:#0f172a,stroke-width:1px;
    classDef analysis fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95,stroke-width:1px;
    classDef command fill:#fef3c7,stroke:#d97706,color:#7c2d12,stroke-width:1px;
    classDef execution fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,stroke-width:1px;

    configs[Config manifests\n(config/, storage/)]:::inputs --> surface[owner:surface]:::analysis
    surface --> matrix[owner:parameters]:::analysis
    matrix --> doctor[owner:doctor]:::analysis
    doctor --> mission[owner:mission-control]:::command
    mission --> updateAll[owner:update-all]:::execution
    updateAll --> contractsCore[contracts/v2 core modules]:::execution
```

- **Surface scan:** `npm run owner:surface` fingerprints every config file, normalises addresses, and highlights drift against the deployed control plane so owners see exactly which modules need attention before touching the chain.【F:scripts/v2/ownerControlSurface.ts†L1-L120】【F:scripts/v2/ownerControlSurface.ts†L121-L248】
- **Matrix export:** `npm run owner:parameters` renders markdown, JSON, and mermaid matrices that map every subsystem to its calibration commands and verification steps, ready to drop into compliance reports or mission reviews.【F:scripts/v2/ownerParameterMatrix.ts†L1-L120】【F:scripts/v2/ownerParameterMatrix.ts†L121-L240】
- **Doctor triage:** `npm run owner:doctor` scores each subsystem with `pass/warn/fail`, escalates on missing keys, and recommends remediation commands, enforcing deterministic ownership of the entire lattice.【F:scripts/v2/ownerControlDoctor.ts†L1-L120】【F:scripts/v2/ownerControlDoctor.ts†L121-L248】
- **Mission orchestration:** `npm run owner:mission-control` condenses the owner dossier, parameter diffs, and pause levers into a single decision brief for final sign-off.【F:scripts/v2/ownerMissionControl.ts†L1-L200】
- **Deterministic execution:** `npm run owner:update-all` streams the plan into Hardhat transactions or Safe bundles so parameter updates and address rotations land atomically, with artifacts saved alongside the CI owner-control reports.【F:scripts/v2/updateAllModules.ts†L1-L120】【F:scripts/v2/updateAllModules.ts†L121-L240】

Each stage emits markdown and JSON artefacts beneath `reports/owner-control/`, the same directory uploaded by CI v2 to prove the owner still wields ultimate authority while the automation remains fully transparent.【F:.github/workflows/ci.yml†L393-L440】

## CI v2 orchestration
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

### CI telemetry feed & dashboards

```mermaid
flowchart LR
    classDef artefact fill:#ecfeff,stroke:#0369a1,color:#0f172a,stroke-width:1px;
    classDef cli fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95,stroke-width:1px;
    classDef surface fill:#f1f5f9,stroke:#1e293b,color:#0f172a,stroke-width:1px;

    summaryJob[ci (v2) / CI summary]:::cli --> statusJson[reports/ci/status.json]:::artefact
    summaryJob --> statusMarkdown[reports/ci/status.md]:::artefact
    statusJson --> dashboards[Mission dashboards\n& release control rooms]:::surface
    statusMarkdown --> briefings[Owner briefings\n& PR threads]:::surface
    cliProbe[npm run ci:status-wall]:::cli --> statusJson
```

- `reports/ci/status.json` exposes a machine-readable feed of the latest CI lattice; it is generated in every run and uploaded as an artefact so dashboards and compliance monitors can subscribe without scraping GitHub.【F:.github/workflows/ci.yml†L1026-L1155】
- `reports/ci/status.md` mirrors the JSON feed in Markdown for direct inclusion in release notes, investor updates, or PR discussions.【F:.github/workflows/ci.yml†L1026-L1155】
- `npm run ci:status-wall -- --token <github_token> --require-success --include-companion --format json` fetches the same data from the GitHub API on demand, giving mission owners and release captains a deterministic way to gate deployments or cut dashboards from their local terminal. Swap in `--format markdown` to reproduce the README tables programmatically.【F:scripts/ci/check-ci-status-wall.ts†L73-L100】【F:scripts/ci/check-ci-status-wall.ts†L312-L387】
- The artefacts capture the full badge wall, including fork bypass annotations, so anyone consuming the feed has the same visibility as the GitHub checks tab without needing repo admin permissions.【F:.github/workflows/ci.yml†L966-L1155】

### Required contexts
The branch protection rule enforces the following `ci (v2)` contexts, guaranteeing a visible, fully green wall before merge:

| Context | Description |
| ------- | ----------- |
| Lint & static checks | Hardhat/TypeScript linting, manifest validation, and lock enforcement.【F:.github/workflows/ci.yml†L34-L74】 |
| Tests | Hardhat compilation, test execution, ABI drift detection.【F:.github/workflows/ci.yml†L75-L117】 |
| Python unit tests | Unit-level analytics covering paymaster, tools, orchestrator, and simulation suites.【F:.github/workflows/ci.yml†L118-L167】 |
| Python integration tests | Route-level API integration, demo rehearsal validation, and deterministic analytics.【F:.github/workflows/ci.yml†L168-L215】 |
| Load-simulation reports | Monte Carlo sweeps producing CSV + JSON artefacts for economic stress tests.【F:.github/workflows/ci.yml†L216-L292】 |
| Python coverage enforcement | Combines unit/integration coverage and enforces thresholds.【F:.github/workflows/ci.yml†L293-L349】 |
| HGM guardrails | Higher Governance Machine regression suite spanning Node + Python controllers.【F:.github/workflows/ci.yml†L350-L392】 |
| Owner control assurance | Owner doctor reports, command center digest, and parameter matrices proving the owner retains ultimate authority.【F:.github/workflows/ci.yml†L393-L440】 |
| Foundry | Forge test harness with fuzz + invariant coverage for Solidity contracts.【F:.github/workflows/ci.yml†L444-L494】 |
| Coverage thresholds | Solidity coverage plus access-control remapping and enforcement.【F:.github/workflows/ci.yml†L496-L546】 |
| Phase 6 readiness | Scenario validation for the Phase 6 expansion demo.【F:.github/workflows/ci.yml†L548-L577】 |
| Phase 8 readiness | Scenario validation for the Phase 8 dominance demo.【F:.github/workflows/ci.yml†L580-L608】 |
| Kardashev II readiness | Kardashev II + Stellar rehearsals to keep planetary demos deployable.【F:.github/workflows/ci.yml†L610-L641】 |
| ASI Take-Off Demonstration | Full-length ASI take-off run with artefact exports.【F:.github/workflows/ci.yml†L644-L684】 |
| Zenith Sapience Demonstration | Deterministic + local rehearsal for Zenith Sapience initiatives.【F:.github/workflows/ci.yml†L686-L736】 |
| AGI Labor Market Grand Demo | Exports transcripts for the labour market grand simulation.【F:.github/workflows/ci.yml†L742-L782】 |
| Sovereign Mesh Demo — build | Builds sovereign mesh server + console bundles.【F:.github/workflows/ci.yml†L785-L819】 |
| Sovereign Constellation Demo — build | Builds constellation orchestrator + console assets.【F:.github/workflows/ci.yml†L822-L858】 |
| Celestial Archon Demonstration | Deterministic + local rehearsals for Celestial Archon governance.【F:.github/workflows/ci.yml†L860-L910】 |
| Hypernova Governance Demonstration | Hypernova rehearsal with local deterministic replay.【F:.github/workflows/ci.yml†L911-L965】 |
| Branch protection guard | Audits GitHub branch protection live against the manifests and fails on drift. Forked PRs log a bypass note yet keep the required context green so protected branches still enforce the policy.【F:.github/workflows/ci.yml†L966-L1089】【F:ci/required-contexts.json†L1-L24】 |
| CI summary | Aggregates every job outcome, writes Markdown + JSON status artefacts, and fails if any job was red or artefacts are missing.【F:.github/workflows/ci.yml†L1026-L1155】 |
| Invariant tests | Dedicated Forge invariant suite with cached build graph and fuzz tuning.【F:.github/workflows/ci.yml†L1157-L1181】 |

Companion workflows are also required (`static-analysis`, `fuzz`, `webapp`, `containers`, `e2e`), guaranteeing the checks tab mirrors the entire assurance surface.【F:ci/required-companion-contexts.json†L1-L11】

### Companion workflow lattice
```mermaid
flowchart TD
    classDef main fill:#ecfeff,stroke:#0284c7,color:#0f172a,stroke-width:1px;
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

The manifest in `ci/required-companion-contexts.json` marks every companion workflow as required so the PR checks wall cannot go green unless they all pass beside the `ci (v2)` contexts, and `npm run ci:verify-companion-contexts` fails if the manifest drifts from GitHub's configuration.【F:ci/required-companion-contexts.json†L1-L11】【F:package.json†L135-L146】

### Branch protection autopilot

```mermaid
flowchart LR
    classDef manifest fill:#ecfdf5,stroke:#10b981,color:#064e3b,stroke-width:1px;
    classDef guard fill:#f1f5f9,stroke:#1e293b,color:#0f172a,stroke-width:1px;
    classDef summary fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,stroke-width:1px;

    manifestDeck[ci/required-contexts.json\nci/required-companion-contexts.json]:::manifest --> branchGuard[ci (v2) / Branch protection guard]:::guard
    branchGuard --> githubAPI[GitHub Branch Protection API\n(enforced contexts)]:::guard
    branchGuard --> ciSummary[ci (v2) / CI summary]:::summary
    ciSummary --> checksTab[Protected branch checks wall]:::summary
```

Run the manifest + enforcement bundle whenever you add or rename CI jobs to keep PRs and `main` locked to the green wall:

| Step | Command | Purpose |
| ---- | ------- | ------- |
| 1 | `npm run ci:sync-contexts -- --check` | Assert that `ci/required-contexts.json` mirrors `.github/workflows/ci.yml`; rerun without `--check` to regenerate after intentional changes.【F:ci/required-contexts.json†L1-L24】【F:package.json†L135-L146】 |
| 2 | `npm run ci:verify-contexts` | Validate the friendly names used in branch protection so badge text and required contexts stay aligned.【F:package.json†L135-L146】 |
| 3 | `npm run ci:verify-companion-contexts` | Confirm the companion workflows stay registered as required alongside the main CI lattice.【F:ci/required-companion-contexts.json†L1-L11】【F:package.json†L135-L146】 |
| 4 | `npm run ci:verify-branch-protection -- --branch main` | Fetch the live branch protection rule via the GitHub API and fail on missing contexts before merges slip through.【F:package.json†L135-L146】【F:.github/workflows/ci.yml†L966-L1057】 |
| 5 | `npm run ci:enforce-branch-protection -- --branch main` | Apply the manifest to GitHub branch protection so the checks wall must remain fully green on `main` and protected release branches.【F:package.json†L135-L146】 |

The `ci (v2) / Branch protection guard` job re-runs step 4 inside every workflow execution and writes a bypass notice when forks lack administrative scopes, while the `ci (v2) / CI summary` job fails the run if any required job or artefact is missing—ensuring the enforcement wall is both visible and blocking.【F:.github/workflows/ci.yml†L966-L1155】

### CI badge wall (ci (v2))

| Job | Live badge |
| --- | ---------- |
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

The badge query filters directly on the workflow run logs, so PR reviewers and release captains can confirm the fully green wall without leaving the repository homepage. Each job corresponds to the required contexts enumerated below and enforced by branch protection.【F:.github/workflows/ci.yml†L34-L1181】【F:ci/required-contexts.json†L1-L24】

### Enforcing branch protection
1. Generate or refresh required contexts:
   ```bash
   npm run ci:sync-contexts -- --check
   npm run ci:verify-contexts
   npm run ci:verify-companion-contexts
   ```
   Use `npm run ci:sync-contexts` (without `--check`) if you add or rename CI jobs; it rewrites the manifest deterministically and fails when duplicates slip in.【F:package.json†L135-L146】【F:scripts/ci/update-ci-required-contexts.ts†L1-L83】
2. Audit the live rule without mutations:
   ```bash
   npm run ci:enforce-branch-protection -- --dry-run --branch main
   ```
3. Verify the GitHub rule via the public API without mutating anything (requires a fine-grained PAT or GitHub App token with `administration:read` scope):
   ```bash
   GITHUB_TOKEN=<token> npm run ci:verify-branch-protection -- --owner MontrealAI --repo AGIJobsv0 --branch main
   ```
   The script confirms the live protection rule matches `ci/required-contexts.json` and `ci/required-companion-contexts.json`, failing if the GitHub configuration is stale or missing contexts.【F:package.json†L138-L146】【F:scripts/ci/verify-branch-protection.ts†L1-L239】
4. Apply the rule (requires repo admin token):
   ```bash
   npm run ci:enforce-branch-protection -- --branch main
   ```
   The branch protection guard job revalidates these expectations on every push to `main`, keeping policy and automation in sync while gracefully bypassing forked PRs that lack administrative scope.【F:package.json†L135-L146】【F:.github/workflows/ci.yml†L966-L1089】

### Artefacts
- `reports/ci/status.{md,json}` – machine-readable run summaries consumed by release captains and compliance audits.【F:.github/workflows/ci.yml†L1026-L1155】
- `reports/owner-control/**` – authority matrices, doctor reports, command-center digest, and parameter plans proving owner command coverage.【F:.github/workflows/ci.yml†L393-L440】
- `reports/load-sim/**` – Monte Carlo CSV + JSON payloads with economic dissipation analysis.【F:.github/workflows/ci.yml†L216-L292】

## Architecture panorama
```mermaid
flowchart TD
    classDef ops fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95,stroke-width:1px;
    classDef core fill:#ecfeff,stroke:#0284c7,color:#0f172a,stroke-width:1px;
    classDef demos fill:#fef2f2,stroke:#b91c1c,color:#7f1d1d,stroke-width:1px;
    classDef obs fill:#f1f5f9,stroke:#1e293b,color:#0f172a,stroke-width:1px;

    Owners((Mission Owners)):::ops --> OwnerPlane[Owner Control Plane]:::ops
    OwnerPlane --> Contracts[[Solidity Kernel + Modules]]:::core
    Contracts --> Services[[Agent Gateway & Services]]:::core
    Services --> Apps[[Operator / Validator Apps]]:::core
    Services --> Demos[[Strategic Demos]]:::demos
    Contracts --> Observability[[Sentinel, Thermostat, Load Sims]]:::obs
    Observability --> CI[[CI v2 + Companion Workflows]]:::obs
    CI --> Owners
    Demos --> Observability
```

## Documentation & support
- [`OperatorRunbook.md`](OperatorRunbook.md) – live incident and escalation procedures for mission owners.
- [`RUNBOOK.md`](RUNBOOK.md) – consolidated runbooks for validators, agents, and deployment captains.
- [`SECURITY.md`](SECURITY.md) – disclosure policy, threat model, and contact instructions.
- [`docs/user-guides/`](docs/user-guides/README.md) – curated mission guides that plug directly into the owner control plane.
- [`ci/`](ci/README.md) – detailed CI v2 manifest, branch protection checklist, and verification commands.

## License
Released under the MIT License. See [`LICENSE`](LICENSE) for details.
