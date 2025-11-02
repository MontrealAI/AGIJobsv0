# AGI Jobs v0 (v2) — Operating System Grand Demonstration

## Overview

The `demo:agi-os` command assembles a first-class demonstration of the AGI Jobs v0 (v2)
operating system by orchestrating the existing ASI take-off pipeline, synthesising the
owner-control authority surface, and packaging every artefact into a mission bundle
that a non-technical owner can review or ship to production. The script uses only
existing functionality within this repository and layers best-practice reporting on
top of the generated artefacts.

Running the demonstration performs the following high-level steps:

1. Refreshes the ASI take-off artefacts (constants, compilation, dry-run replay,
   thermodynamic telemetry, mission control dossier, and owner-control verification).
2. Reads the published artefacts and the committed governance configuration to build
   a **control matrix** covering every module that the owner can tune, pause, or rotate.
3. Generates a human-readable mission dossier together with a machine-parseable JSON
   summary so that both operational teams and automation can act on the results.
4. Produces an updated mission bundle under `reports/agi-os/` that references the
   generated outputs alongside the underlying ASI take-off artefacts.

## Quick Start

```bash
npm run demo:agi-os
```

The command defaults to the local Hardhat network and can be executed on any developer
machine with the repository prerequisites installed. All heavy operations are executed
through the existing scripts (`demo:asi-takeoff`, owner dashboards, thermodynamics
reporting) so no additional setup is required.

## Generated Artefacts

The script writes the following files beneath `reports/agi-os/`:

- `grand-summary.md` – high-level mission report formatted for executives and
  non-technical stakeholders.
- `grand-summary.json` – structured mirror of the mission report for downstream
  automation, dashboards, or monitoring hooks.
- `owner-control-matrix.json` – definitive owner command matrix that maps each
  module to its config file(s), update command, and readiness status.
- `mission-bundle/` – a curated bundle (produced by `generateAsiTakeoffKit`) that
  aggregates every referenced artefact, including the original ASI take-off outputs.

All steps log detailed output to `reports/agi-os/logs/`. The `mission-bundle` manifest
also lists the SHA-256 hash and size of each artefact for audit traceability.

## Owner Control Coverage

The control matrix enumerates every module declared in `config/owner-control.json`
and verifies:

- Which configuration files exist locally for the module.
- Whether a dedicated updater script is available or whether the `owner:update-all`
  fallback should be used.
- The documentation that governs safe usage.
- A capability synopsis that highlights the levers available to the owner (e.g.
  pausing, treasury rotation, thermodynamic tuning).

Modules with missing configuration files are explicitly flagged so operators can
remediate the gaps before shipping updates. The matrix also records the configured
`owner` and `governance` addresses so that cold-storage custodians can confirm
control before signing transactions.

## Continuous Integration Alignment

Because `demo:agi-os` reuses the ASI take-off workflow, it indirectly executes the
same linting, compilation, dry-run, thermodynamics, and owner verification gates that
compose the `ci (v2)` GitHub Action. Teams can therefore treat a successful run as
an offline rehearsal of the production CI pipeline. The generated bundle references
`docs/v2-ci-operations.md`, ensuring that branch protection rules remain visible to
non-technical reviewers.

## Operating the Bundle

After running the command:

1. Open `reports/agi-os/grand-summary.md` for the executive overview.
2. Use `owner-control-matrix.json` to drive Gnosis Safe transaction builders or
   manual runbooks—each entry includes the exact Hardhat command to execute.
3. Archive `mission-bundle/agi-os-grand-demo.manifest.json` together with the
   hashed artefacts when preparing change tickets or audit submissions.

The bundle can be regenerated at any time; re-running the command overwrites the
existing artefacts with freshly computed outputs while preserving consistent paths
 for downstream automation.

## Troubleshooting

- Ensure Node.js 20.19.0 (from `.nvmrc`) is active before running the command.
- If Hardhat fails to compile due to stale generated constants, run `npm run compile`
  once and retry.
- When configuration files are intentionally omitted (for example, modules not yet
  deployed to a target network), the control matrix will highlight them under
  "Needs config" so the owner can document the rationale.

For deeper operational guidance consult the documents referenced in the mission
bundle (owner command centre, emergency runbook, CI operations guide).
