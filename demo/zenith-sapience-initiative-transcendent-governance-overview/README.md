# Zenith Sapience Initiative – Transcendent Governance Overview

The **Zenith Sapience Initiative – Transcendent Governance Overview** is the flagship
showcase requested in the “AGI Jobs v0 – ASI Governance Demonstration Overview”. It
packages the repository’s existing AGI Jobs v0 (v2) functionality into a
mainnet-ready, audit-grade rehearsal of a planetary coordination cortex. The demo
leverages only configuration, documentation, and automation that already exist in
this repository – no bespoke logic, migrations, or contracts are introduced.

> **Prime Directive:** prove that the stock `npm run demo:asi-global` control
> plane can be parameterised to orchestrate a multi-sovereign resilience mission
> with live diagrams, blockchain execution logs, and owner-first guardrails,
> entirely from configuration that any non-technical steward can run end-to-end.

## Scenario Summary

- **Mission** – Coordinate a 1.25B $AGIALPHA planetary resilience thrust spanning
  six sovereign blocs. The run adapts incentives in real time through the
  existing thermodynamic reward engine and quadratic governance controls.
- **Automation loop** – The orchestrator (`scripts/v2/asiGlobalDemo.ts`) plans,
  simulates, executes, and reconciles epochs using the repository’s planner,
  simulator, and dashboard generators. The configuration here simply sets the
  mission-specific metadata, parameters, and artefact output locations.
- **Owner supremacy** – All automation routes through production
  contracts (IdentityRegistry, JobRegistry, StakeManager, RewardEngineMB) already
  wired for multisig + timelock oversight. The runbook and owner matrix document
  every command – including pause, thermostat modulation, treasury retargeting,
  and parameter updates – to ensure the owner can intervene instantly.
- **Audit trail** – Deterministic dashboards (`mission-control.md`,
  `command-center.md`, `parameter-matrix.md`, `thermodynamics.json`, Mermaid
  blueprints) are generated inside `reports/zenith-sapience-transcendent/` and
  hashed into the governance kit for continuous CI coverage.

## Quickstart for Mission Stewards

1. **Install prerequisites** following [docs/setup.md](../../docs/setup.md).
2. **Run the deterministic governance build**:

   ```bash
   npm run demo:zenith-sapience-transcendent
   ```

   The wrapper injects initiative-specific metadata while invoking the canonical
   `scripts/v2/asiGlobalDemo.ts` entrypoint.
3. **Rehearse locally with an ephemeral chain**:

   ```bash
   npm run demo:zenith-sapience-transcendent:local
   ```

   This spins up the Hardhat/Anvil rehearsal pipeline, routes reports to
   `reports/localhost/zenith-sapience-transcendent`, and renders the Aurora
   mission report for quick validation.
4. **Inspect the artefacts** under
   `reports/zenith-sapience-transcendent/` (or the network-specific folder for
   local runs):
   - `summary.md` – executive briefing and KPI checkpoints.
   - `mission-control.md` – live governance dossier with pause status, treasury
     balances, and multisig wiring.
   - `command-center.md` – owner command map, parameter levers, and thermostat
     history.
   - `governance.mmd` / `governance.md` – generated Mermaid diagrams showing the
     identity, mission, economic, execution, and assurance subsystems.
   - `zenith-sapience-transcendent-kit.*` – hashed manifests and bundle metadata
     suitable for auditors.

All commands default to dry-run mode. Owner instructions note exactly when the
`--execute` flag is required, mirroring the production operator workflow.

## Assets in this Demo Capsule

| File | Purpose |
| --- | --- |
| [`project-plan.json`](./project-plan.json) | Structured mission plan consumed by `scripts/v2/asiGlobalDemo.ts` – references only existing scripts and owner CLIs. |
| [`RUNBOOK.md`](./RUNBOOK.md) | Step-by-step procedures for owners, stewards, and auditors (including drills and failure escalations). |
| [`OWNER-CONTROL.md`](./OWNER-CONTROL.md) | Exhaustive owner parameter catalogue and operational commands. |
| [`bin/zenith-transcendent.sh`](./bin/zenith-transcendent.sh) | Deterministic wrapper around `npm run demo:asi-global` with initiative metadata. |
| [`bin/zenith-transcendent-local.sh`](./bin/zenith-transcendent-local.sh) | Local rehearsal harness for Hardhat/Anvil with Aurora report generation. |

## Architecture & Governance

The initiative retains the repository’s canonical topology:

- **Identity & Access** – ENS-tagged agents enforced via `IdentityRegistry` and
  `config/identity-registry*.json`.
- **Mission Design** – Planner, simulator, and adaptive policy modules under
  `orchestrator/` provide the plan → simulate → evaluate → feedback loop.
- **Economic Kernel** – `RewardEngineMB`, `StakeManager`, and the thermodynamic
  incentive layer respond to telemetry to rebalance shares and temperature.
- **Execution Surface** – Jobs, agent gateways, and service pipelines execute
  workloads while logging proof bundles back on-chain.
- **Oversight & Assurance** – CI workflows, Foundry fuzzing, mission runbooks,
  and dashboards provide real-time auditability.

The generated Mermaid diagrams (rendered via
`scripts/v2/renderOwnerMermaid.ts`) document the flow in the exact style shown in
the user specification. No new rendering logic is added.

## Continuous Integration & Release Discipline

- `.github/workflows/demo-zenith-sapience-transcendent.yml` ensures every PR and
  main-branch update runs this capsule, uploads the resulting artefacts, and acts
  as a required status check beside the existing `ci (v2)` pipeline.
- The workflow simply calls `npm run demo:zenith-sapience-transcendent` – keeping
  parity with the local instructions – and relies on the same Node/Foundry setup
  used by other demos.
- Because the initiative uses only deterministic scripts, every CI run produces a
  reproducible governance kit for auditors. Artefacts appear as downloadable
  attachments in the Actions UI, giving reviewers the live dashboards described
  in the specification.

## Next Steps

- Re-run `npm run demo:zenith-sapience-transcendent` whenever mission parameters
  or documentation change to regenerate the deterministic kit.
- Use the provided owner commands to drill pause scenarios, thermostat
  recalibration, or multisig rotations. All examples are ready for copy/paste.
- Promote the generated `governance.md` diagrams and command centre dashboards
  into executive portals or monitoring consoles.

This capsule therefore fulfils the “AGI Jobs v0 – ASI Governance Demonstration
Overview” brief entirely through configuration – manifesting an iconic, owner-
controlled ASI governance showcase atop the production AGI Jobs v0 (v2) stack.
