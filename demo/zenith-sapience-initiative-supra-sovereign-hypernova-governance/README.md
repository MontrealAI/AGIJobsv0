# Zenith Sapience Initiative – Supra-Sovereign Hypernova Governance Demonstration

The **Supra-Sovereign Hypernova** rehearsal pushes the repository's ASI governance stack
into a high-energy, multi-epoch stress test without introducing any new contracts or
custom executors. It is engineered as a turnkey experience for non-technical owners:
every command delegates to battle-tested scripts that already ship with AGI Jobs v0 (v2),
wrapping them in mission-specific configuration, diagrams, and audit bundles.

> **Prime directive:** Orchestrate a five-continent resilience surge, exercising every
> owner override (pause, thermostat, treasury, validator rotation) while proving that the
> canonical `npm run demo:asi-global` tooling can sustain repeated thermodynamic shock
> adjustments under continuous CI enforcement.

## Scenario Snapshot

- **Mission frame** – A coalition of nation blocs funds the Hypernova Transition Grid,
  demanding verifiable delivery of climate, infrastructure, and humanitarian milestones
  across synchronized epochs.
- **Governance spine** – Multisig + timelock authority confirmed through Mission Control
  dossiers, mermaid topology renders, and owner command matrices generated directly from
  repository scripts.
- **Economic kernel** – RewardEngineMB, StakeManager, and Dispute workflows handle
  incentives, slashing, and treasury routing with thermodynamic steering toggled live.
- **Automation loop** – Plan → simulate → dry-run → reporting executed through the
  existing `scripts/v2/asiGlobalDemo.ts` harness; this demo only adjusts environment
  variables.
- **Audit surface** – Deterministic governance kit, SHA-256 manifests, Mission Control
  briefings, and thermodynamic reports stored under `reports/zenith-hypernova/`.

## Operator Quickstart

1. **Install prerequisites** – Node.js 20+, npm, Hardhat/Foundry toolchain as documented
   in [docs/setup.md](../../docs/setup.md).
2. **Generate the deterministic kit**:

   ```bash
   npm run demo:zenith-hypernova
   ```

   This wrapper sets Hypernova-specific environment overrides for
   `scripts/v2/asiGlobalDemo.ts`, emitting artefacts to
   `reports/zenith-hypernova/` and packaging a governance kit named
   `zenith-hypernova-governance-kit`.
3. **(Optional) Execute the local rehearsal loop** – spins up an ephemeral Hardhat node
   with scripted agents and validators:

   ```bash
   npm run demo:zenith-hypernova:local
   ```

4. **Inspect the artefacts** under `reports/zenith-hypernova/`:
   - `summary.md` – executive KPI brief.
   - `mission-control.md` – pause status, treasury wiring, multisig authorities.
   - `command-center.md` – owner command cheat sheet.
   - `governance.mmd` / `governance.md` – mermaid topology and rendered view.
   - `zenith-hypernova-governance-kit.*` – hashed manifest and markdown bundle for
     auditors.

All owner scripts default to preview/dry-run behaviour. Adding `--execute` is a deliberate
act requiring multisig approval and is captured in the Mission Control output.

## Assets Included

| File | Purpose |
| --- | --- |
| [`project-plan.json`](./project-plan.json) | Structured orchestration brief consumed by `scripts/v2/asiGlobalDemo.ts`. |
| [`RUNBOOK.md`](./RUNBOOK.md) | End-to-end operator drill, covering dry-runs, pauses, disputes, and thermodynamic swings. |
| [`OWNER-CONTROL.md`](./OWNER-CONTROL.md) | Owner authority matrix with ready-to-execute CLI commands. |
| [`bin/zenith-hypernova.sh`](./bin/zenith-hypernova.sh) | Deterministic kit wrapper for CI and manual runs. |
| [`bin/zenith-hypernova-local.sh`](./bin/zenith-hypernova-local.sh) | Local rehearsal harness targeting an Anvil/Hardhat fork. |

## Configuration Strategy

The wrapper scripts only export environment variables already supported by the global
demo pipeline:

- `ASI_GLOBAL_PLAN_PATH` → points at this folder's `project-plan.json`.
- `ASI_GLOBAL_REPORT_ROOT` → relocates artefacts to `reports/zenith-hypernova/`.
- `ASI_GLOBAL_OUTPUT_BASENAME` → renames the governance kit to
  `zenith-hypernova-governance-kit`.
- `ASI_GLOBAL_BUNDLE_NAME` & `ASI_GLOBAL_MERMAID_TITLE` → retitle the bundle and
  diagrams without touching rendering logic.
- `ASI_GLOBAL_REFERENCE_DOCS_APPEND` & `ASI_GLOBAL_ADDITIONAL_ARTIFACTS_APPEND` → inject
  this runbook and owner dossier into the generated kit.

No contracts, migrations, or novel code paths are introduced – we strictly parameterise
existing automation to maintain production parity.

## Governance & Safety

`OWNER-CONTROL.md` enumerates every owner-facing toggle (system pause, thermostat,
reward splits, identity registry updates, validator rotation, quadratic governance tools)
with explicit CLI usage. Mission Control outputs confirm the multisig + timelock
hierarchy, ensuring human governors retain absolute authority over automation at all
moments.

## Continuous Integration

`.github/workflows/demo-zenith-hypernova.yml` runs both Hypernova wrappers on pull
requests touching this demo or the shared ASI tooling. The job uploads artefacts for
reviewers and feeds into the main `ci (v2)` workflow, which now blocks merges until the
Hypernova rehearsal is green. Branch protection guidance in
[docs/ci-v2-branch-protection-checklist.md](../../docs/ci-v2-branch-protection-checklist.md)
has been updated accordingly so non-technical owners can verify enforcement.

## Follow-on Actions

- Execute `npm run demo:zenith-hypernova` whenever plan, governance docs, or owner
  guidance changes.
- Embed `reports/zenith-hypernova/governance.md` into dashboards so executives can review
  live topology diagrams.
- Run `npm run owner:verify-control -- --network hardhat` after deployments to confirm the
  wiring still matches the Hypernova specification.

The Supra-Sovereign Hypernova drill therefore delivers a spectacular yet controlled
planetary governance showcase, staying inside the repo's existing battle-tested surfaces
while maximising auditability and owner supremacy.
