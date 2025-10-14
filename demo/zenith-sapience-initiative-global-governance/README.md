# Zenith Sapience Initiative – Global Decentralized Governance Demonstration

The **Zenith Sapience Initiative** packages the repository's existing ASI governance stack
into a planetary-scale rehearsal that can be executed end-to-end by a non-technical owner.
It reuses the production-grade contracts, Foundry/Hardhat harnesses, governance dashboards,
and mission-control tooling that already ship with AGI Jobs v0 (v2). The demonstration stays
true to the repo's "mainnet-first" discipline while surfacing rich artefacts, live diagrams,
and owner override procedures.

> **Primary objective:** prove that the canonical `npm run demo:asi-global` flow can be
> parameterised – without modifying any deployed module – to coordinate a planetary
> coalition while the contract owner retains absolute control (pause, upgrade, parameter
> tuning, and treasury redirection).

## Scenario at a Glance

- **Mission** – Deliver a climate-resilience programme spanning six sovereign blocs while
  continuously steering thermodynamic incentives and quadratic governance checks.
- **Governance spine** – Multisig + timelock control with full owner runbooks, rendered
  mermaid topologies, and command-centre dossiers generated directly from the repo's
  scripts.
- **Economic kernel** – Thermodynamic reward splits, stake bonding, and validator disputes
  handled through the production RewardEngineMB, StakeManager, and Dispute modules.
- **Automation** – Closed-loop plan → simulate → dry-run → reporting executed through
  `scripts/v2/asiGlobalDemo.ts`, augmented here via environment overrides only.
- **Audit trail** – Deterministic governance kit with SHA-256 manifests, command logs,
  thermodynamics snapshots, and Mission Control dashboards stored under
  `reports/zenith-sapience/`.

## Quickstart for Mission Operators

1. **Install prerequisites** (Node 20+, npm, Foundry optional) as described in
   [docs/setup.md](../../docs/setup.md) if not already available.
2. **Execute the deterministic kit build**:

   ```bash
   npm run demo:zenith-sapience-initiative
   ```

   The wrapper script sets the necessary environment variables for
   `scripts/v2/asiGlobalDemo.ts`, producing reports under
   `reports/zenith-sapience/` and a governance kit named
   `zenith-sapience-initiative-kit`.
3. **(Optional) Run the local rehearsal loop** with an ephemeral Hardhat/Anvil node,
   simulated agents, and validator feedback:

   ```bash
   npm run demo:zenith-sapience-initiative:local
   ```

4. **Review mission artefacts** in `reports/zenith-sapience/`:
   - `summary.md` – executive mission briefing with KPI checkpoints.
   - `mission-control.md` – live governance dossier with pause status, treasury, and
     multisig wiring.
   - `command-center.md` – per-parameter command cheatsheet.
   - `governance.mmd` / `governance.md` – mermaid topology and rendered overview.
   - `zenith-sapience-initiative-kit.*` – hashed manifest + Markdown ready for auditors.

All commands are read-only/dry-run safe by default. Adding `--execute` to any owner CLI is
an explicit, logged action documented in the runbook.

## Included Assets

| File | Purpose |
| --- | --- |
| [`project-plan.json`](./project-plan.json) | Structured orchestration plan consumed by `scripts/v2/asiGlobalDemo.ts`. |
| [`RUNBOOK.md`](./RUNBOOK.md) | Step-by-step operator procedures, including contingency drills. |
| [`OWNER-CONTROL.md`](./OWNER-CONTROL.md) | Parameter catalogue and command syntax for the contract owner. |
| [`bin/zenith-sapience.sh`](./bin/zenith-sapience.sh) | Deterministic CI wrapper around `npm run demo:asi-global`. |
| [`bin/zenith-sapience-local.sh`](./bin/zenith-sapience-local.sh) | Local rehearsal harness targeting a Hardhat/Anvil fork. |

## How It Works

The wrapper scripts only inject environment variables understood by the existing global
demo pipeline:

- `ASI_GLOBAL_PLAN_PATH` points to `project-plan.json` in this folder.
- `ASI_GLOBAL_REPORT_ROOT` relocates artefacts to `reports/zenith-sapience/` so the
  canonical pipeline remains untouched.
- `ASI_GLOBAL_OUTPUT_BASENAME` renames the governance kit to
  `zenith-sapience-initiative-kit`.
- `ASI_GLOBAL_REFERENCE_DOCS_APPEND` and
  `ASI_GLOBAL_ADDITIONAL_ARTIFACTS_APPEND` enrich the generated kit with this runbook and
  owner control dossier.
- `ASI_GLOBAL_MERMAID_TITLE`/`ASI_GLOBAL_BUNDLE_NAME` retitle the governance diagrams while
  keeping the existing rendering logic.

Because the scripts merely parameterise existing code paths, the contracts, migrations, and
on-chain behaviour remain unchanged. Everything runs through the same TypeScript/Hardhat
entrypoints that already gate the production deployment.

## Governance Controls

`OWNER-CONTROL.md` describes every owner-accessible toggle (pause, thermostat updates,
fee/treasury adjustments, validator rotation) with concrete CLI examples. The generated
Mission Control dossier cross-links each control, ensuring auditors can verify the owner
retains supremacy over automation at all times.

## Continuous Integration

`.github/workflows/demo-zenith-sapience-initiative.yml` executes the wrapper script for
pull requests touching demo or governance assets. The pipeline uploads the resulting
artefacts to the PR for inspection, and the main `ci (v2)` workflow now depends on this
job to remain green before merge.

## Next Steps

- Run `npm run demo:zenith-sapience-initiative` to regenerate artefacts whenever plan,
  governance, or documentation changes are proposed.
- Embed `reports/zenith-sapience/governance.md` into executive dashboards or wikis for
  live topology visibility.
- Use `npm run owner:verify-control -- --network hardhat` after any deployment to confirm
  ownership wiring matches the Zenith specification.

The Zenith Sapience Initiative is therefore fully reproducible, auditable, and safely
parameterised – achieving an "unstoppable" automation loop without compromising owner
control.
