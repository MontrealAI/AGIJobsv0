# AGI Jobs v0 (v2) — Configuration Lattice

[![CI (v2)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)
[![Static analysis](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/static-analysis.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/static-analysis.yml)

The `config/` tree is the control surface that keeps the AGI Jobs v0 (v2) superintelligence parameterised for any deployment. It
feeds every on-chain contract, off-chain agent, and analytics surface with deterministic JSON manifests that are continuously
validated in CI v2. Repository owners can flip network parameters, pause levers, or sentinel tolerances by editing these
manifests and then running the owner tooling—no TypeScript or Solidity edits required.

## Responsibilities

- Canonical token, registry, and sentinel manifests consumed by `scripts/config` and the Hardhat/Foundry suites.
- Network overlays for `mainnet`, `sepolia`, `ci`, and profile-specific overrides driven by `AGIALPHA_PROFILE`.
- Owner guardrails that make pausing, upgrading, or rotating keys auditable through `npm run owner:*` flows.
- Machine-readable inputs for the Monte Carlo load simulations and Higher Governance Machine (HGM) controllers.

```mermaid
flowchart TD
    classDef cfg fill:#ecfdf5,stroke:#10b981,color:#064e3b,stroke-width:1px;
    classDef tool fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,stroke-width:1px;
    classDef ci fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95,stroke-width:1px;
    classDef chain fill:#fef2f2,stroke:#b91c1c,color:#7f1d1d,stroke-width:1px;

    cfg[config/*.json manifests]:::cfg --> scripts[TypeScript config loaders]:::tool
    scripts --> ciJobs[ci (v2) validation jobs]:::ci
    scripts --> ownerCli[npm run owner:* command surface]:::tool
    ownerCli --> chain[Contracts + orchestration services]:::chain
    ciJobs --> chain
```

## File map

| Path | Purpose |
| ---- | ------- |
| [`__init__.py`](__init__.py) | Profile-aware loader that merges base JSON manifests with `AGIALPHA_PROFILE` overlays for Python services.【F:config/__init__.py†L1-L116】 |
| [`agents.json`](agents.json) | Canonical catalog of production agent definitions consumed by orchestrator and gateway flows. |
| [`agialpha*.json`](agialpha.json) | Token metadata (address, decimals, symbol) for each network. Used by contract compilation and the gateway wallet checks.【F:agent-gateway/utils.ts†L126-L153】 |
| [`agialpha/`](agialpha) | Sub-manifests for the HGM profile: thermostat bounds, sentinel guardrails, energy oracle defaults, and reward tuning. |
| [`contracts.orchestrator.json`](contracts.orchestrator.json) | Wiring diagram for orchestrator-facing contracts (registry, installers, pause switches) referenced by deployment scripts. |
| [`energy-oracle*.json`](energy-oracle.json) | Calibration for the Hamiltonian energy oracle and Monte Carlo sweep ranges enforced in CI.【F:.github/workflows/ci.yml†L206-L272】 |

All manifests are JSON so that operators can modify them in approved change-management tools; Python and TypeScript loaders
automatically coerce numeric types and validate enums.

## Editing parameters

1. **Select the profile** – export `AGIALPHA_PROFILE=<profile>` to enable the overrides under `config/<profile>/` when running
   local tooling.
2. **Modify the manifest** – edit the relevant `*.json` file (for example `config/agialpha.json` to rotate the token treasury or
   `config/agialpha/thermostat.json` to tighten ROI bounds).
3. **Describe the change** – capture the intent in `docs/owner-control-change-ticket.md` and commit the updated JSON. Keep owner
   signatures in the PR description for auditability.

## Validation commands

Run these helpers from the repository root after changing configuration:

```bash
npm run verify:wiring                  # Hardhat wiring + manifest sanity checks
npm run verify:agialpha -- --network ci  # Token manifest validation (address checks, symbol/name presence)
npm run owner:verify-control -- --network ci  # End-to-end owner authority audit and pause lever smoke test
npm run ci:owner-authority -- --network ci --out reports/owner-control  # Regenerate the authority matrix referenced in CI
```

CI v2 executes the same commands inside the `Lint & static checks` and `Owner control assurance` jobs, keeping the branch
protection rule in lock-step with the manifests.【F:.github/workflows/ci.yml†L44-L74】【F:.github/workflows/ci.yml†L393-L439】

## Owner operations

- **Pause / resume** – `npm run owner:system-pause -- --network <network>` toggles the global pause switch declared in
  `config/system-pause.json`. The script emits structured JSON so non-technical owners can confirm the transaction before
  broadcasting.【F:scripts/v2/systemPauseAction.ts†L1-L289】
- **Parameter matrix** – `npm run owner:parameters -- --network <network>` renders the current treasury, fee, thermostat, and
  validator settings from every manifest, matching the matrix generated in CI for compliance artefacts.【F:scripts/v2/ownerParameterMatrix.ts†L1-L612】
- **Bulk upgrades** – `npm run owner:update-all -- --network <network>` walks each manifest and applies the updated values
  through the `OwnerConfigurator` contract with automatic dependency ordering.【F:scripts/v2/updateAllModules.ts†L1-L1233】

Every owner command accepts `--dry-run` to preview calldata and `--out` to emit markdown + JSON reports, ensuring full control
remains with the contract owner without editing source.

## CI expectations

- Configuration diffs must keep `npm run monitoring:validate` green so sentinel templates remain deployable.【F:.github/workflows/ci.yml†L71-L104】
- Load simulation sweeps pull the fee and burn percentages from these manifests; unexpected optima raise in CI to catch
  misconfiguration before release.【F:.github/workflows/ci.yml†L206-L272】
- When adding a new manifest, extend `scripts/config/index.ts` loaders and update the relevant owner command so it appears in the
  control matrix.

By keeping the `config/` lattice authoritative, the superintelligent platform stays mutable by owners yet verifiable by CI v2,
allowing immediate deployment in high-stakes environments.
