# ASI Take-Off Demonstration for AGI Jobs v0

The `demo:asi-takeoff` pipeline turns the existing AGI Jobs v0 stack into a national-scale autonomous governance simulation.  It
runs entirely on the deterministic scripts that ship with the repository—no bespoke contracts, no new protocol code, and no hidden
assumptions.

## Capabilities

Running the demonstration performs the following actions:

1. **Protocol regeneration** – calls the canonical constant generator and Hardhat compiler to guarantee artefacts match source.
2. **Lifecycle rehearsal** – executes `scripts/v2/testnetDryRun.ts` to stage jobs, acceptances, validation votes, disputes, and
   epoch settlements under a local Hardhat chain.
3. **Thermodynamic telemetry** – snapshots role shares, global temperature, and entropy alignment using
   `scripts/v2/thermodynamicsReport.ts`.
4. **Mission control dossier** – produces a governance control-plane report via `scripts/v2/ownerMissionControl.ts`, including a
   Mermaid governance diagram, timelock bundle, and high-priority action list.
5. **Owner wiring verification** – re-runs `scripts/v2/verifyOwnerControl.ts` to ensure the SystemPause circuit, treasury routing
   and thermostat permissions remain hardened after the demo completes.
6. **Audit summary** – renders `reports/asi-takeoff/summary.md` which ties each generated artifact to the national high-speed rail
   initiative captured in `demo/asi-takeoff/project-plan.json`.

Outputs are persisted to `reports/asi-takeoff` and include:

- `dry-run.json` – structured replay of the job lifecycle harness.
- `thermodynamics.json` – on-chain configuration comparison for incentive levers.
- `mission-control.md` – governance report with diagrams and checklists.
- `summary.md` / `summary.json` – curated view binding technical telemetry to business goals.
- `logs/*.log` – per-step console output, timestamped for audit replay.

## How to Run

```bash
npm install
npm run demo:asi-takeoff
```

The command may take several minutes on the first run because it compiles the entire contract suite.  The dry-run harness expects
an ephemeral Hardhat network (the default when the script is executed with no `--network` flag).

## CI Integration

The `ci (v2)` workflow exposes a dedicated job named **ASI Take-Off Demonstration**.  It runs `npm run demo:asi-takeoff` on each
pull request and on the `main` branch to guarantee the simulation remains green.  Artefacts are uploaded so reviewers can inspect
mission-control reports, thermodynamic telemetry, and raw logs directly from the PR checks tab.

## Extending the Scenario

The high-speed rail plan used by the demo is described in `demo/asi-takeoff/project-plan.json`.  Updating that file allows teams to
introduce new national programmes (healthcare deployment, energy microgrids, etc.) while reusing the exact same execution pipeline.
The script automatically incorporates any new jobs or participants into the final summary so the documentation always matches the
plan of record.
