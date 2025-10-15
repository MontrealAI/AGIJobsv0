# Omni-Orchestrator Singularity

> *Demonstrating AGI Jobs v0 (v2) as a planetary-scale coordination OS harnessing sovereign AI workforces while preserving absolute owner control.*

The **Omni-Orchestrator Singularity** experience composes existing AGI Jobs v0 (v2) capabilities into a deterministic, production-grade walkthrough that a non-technical operator can execute end-to-end. It packages deployment, governance, orchestration, validation, incentive tuning, and emergency drills behind guided scripts, configuration manifests, and IPFS-ready UI assets so the system can be demonstrated live or replayed inside CI.

The scenario simulates a multi-national council chartering an autonomous programme ("Project Meridian"), with sovereign agents and validators coordinated by the One-Box orchestrator. Contracts, identities, thermodynamic rewards, and governance levers are wired exactly as shipped in v2—no custom contract logic is introduced. Instead we harden the existing stack with defaults, runbooks, and integration glue that guarantees owner supremacy and pause coverage at all times.

## Quickstart

1. **Install dependencies** (matches repository root instructions):
   ```bash
   npm install
   ```
2. **Copy environment templates** for orchestrator and deployment secrets if you have not already:
   ```bash
   cp orchestrator/.env.example orchestrator/.env
   cp deployment-config/.env.example deployment-config/.env
   ```
3. **Dry-run the orchestration pipeline** using the provided helper script (no chain writes, safe for CI):
   ```bash
   demo/omni-orchestrator-singularity/bin/orchestrate.sh \
     --network localhost \
     --mode dry-run
   ```
4. **Review generated artifacts** inside `reports/omni-orchestrator-singularity/` for plan snapshots, governance payloads, pause verifications, and thermodynamic adjustments.

## Scenario Overview

The walkthrough follows seven auditable phases:

1. **Genesis** – Deploys the audited v2 contracts via `scripts/v2/oneclick-stack.ts`, wires `SystemPause`, and verifies owner control using `scripts/v2/verifyOwnerControl.ts`.
2. **Identity Charter** – Registers sovereign agent and validator ENS handles via `npm run identity:update -- --config demo/omni-orchestrator-singularity/config/identities.example.json`.
3. **Mandate Vote** – Boots the `GlobalGovernanceCouncil` template (optional) and scripts a unanimous vote authorising Project Meridian using the existing cosmic-symphony helpers.
4. **One-Box Planning Loop** – Calls the `/onebox/plan`, `/simulate`, `/execute`, and `/status` endpoints via the orchestrator runner, producing deterministic IPFS receipts that the UI renders.
5. **Execution Tapestry** – Drives agents and validators through opt-in, commit-reveal, settlement, and reward distribution using the same helper routines showcased in `demo/aurora/aurora.demo.ts`.
6. **Thermostat Governance** – Exercises `RewardEngineMB` and `Thermostat` owner setters via `SystemPause.executeGovernanceCall`, proving live parameter adjustment while paused.
7. **Emergency Drill & Recovery** – Triggers `pauseAll`, demonstrates orchestrator refusal while paused, then resumes operations and finalises reporting.

Each phase emits machine-readable state to `reports/omni-orchestrator-singularity/` so auditors can replay or diff runs. All generated hashes are persisted with the SRI tooling already bundled in the repo.

## Non-Technical Operator Path

1. Open the [One-Box UI](../..//apps/onebox/README.md) and configure the orchestrator URL plus guest token provided by your deployment.
2. Paste the scripted prompt from `docs/mandate-script.md` into the chat box and follow the confirmation prompts. No private key interaction is required in guest mode.
3. Observe live status cards (auto-refreshes every 5 seconds) summarising job creation, validator tallies, and thermodynamic adjustments.
4. Use the owner console instructions in `docs/owner-console.md` to try a governance action or emergency pause with a single click.

## Artifacts

| Artifact | Location | Description |
| --- | --- | --- |
| Deployment manifest | `reports/omni-orchestrator-singularity/latest/deployment.json` | Contract addresses, ENS roots, pause wiring proofs |
| Governance journal | `reports/omni-orchestrator-singularity/latest/governance.json` | Parameter changes + tx hashes |
| Plan bundle | `reports/omni-orchestrator-singularity/latest/plan.cid` | IPFS CID for plan/simulate/execute receipts |
| Job lifecycle log | `reports/omni-orchestrator-singularity/latest/jobs.json` | Status for every job, validator quorum, settlement |
| Thermodynamic summary | `reports/omni-orchestrator-singularity/latest/thermostat.json` | RewardEngineMB inputs/outputs |

## Branch Protection & CI Alignment

The orchestration script intentionally reuses existing NPM scripts so the default CI v2 pipeline (Lint, Tests, Foundry, Coverage, Summary) remains authoritative. A dedicated make target (`npm run test:demo:omni`) can be added to CI if deeper integration coverage is desired, but the demo is already compatible with `ci:verify-branch-protection` out of the box.

## Status

This directory supplies the orchestration harness, documentation, and configuration templates required to execute the grand demonstration. Implementers must still populate environment secrets, ENS ownership, and funding prior to a mainnet run. No core contracts were modified.

