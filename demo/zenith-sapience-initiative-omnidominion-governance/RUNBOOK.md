# OmniDominion Mission Runbook

This runbook walks an operator through the complete life cycle of the **Zenith Sapience OmniDominion Governance Exemplar**. Every command references tooling that already ships with AGI Jobs v0 (v2). Follow the checklists in order; each task emits an artefact that feeds later stages.

## Pre-flight (15 minutes)

1. **Confirm clean workspace**
   - Pull the latest `main`.
   - Run `git status` to confirm no local changes.
2. **Verify toolchain**
   - `npm ci`
   - `npm run ci:verify-toolchain`
3. **Regenerate protocol constants**
   - `npm run compile`
4. **Snapshot governance state (optional but recommended)**
   - `npm run owner:snapshot -- --network hardhat --out reports/zenith-omnidominion/preflight-owner-snapshot.md`

## Mission execution (45 minutes)

1. **Run deterministic kit**
   - `npm run demo:zenith-sapience-omnidominion`
   - Confirms planning, simulation, dry-run execution, governance reporting, and kit packaging.
2. **Review owner dashboards**
   - Open `reports/zenith-omnidominion/command-center.md`.
   - Open `reports/zenith-omnidominion/parameter-matrix.md`.
   - Confirm the Mermaid topology in `reports/zenith-omnidominion/governance.md` renders with the correct multisig/timelock pairing.
3. **Inspect thermodynamic telemetry**
   - `reports/zenith-omnidominion/thermodynamics.json` lists the captured temperature/entropy snapshot.
   - Compare with the `thermostat` section of `project-plan.json` to ensure the commanded adjustments executed.
4. **Audit mission summary**
   - `reports/zenith-omnidominion/summary.md` enumerates each regional programme and its KPI outcome.
   - If any scenario is flagged `WARN` or `FAIL`, escalate to the owner delegate and rerun after corrective action.

## Emergency drill (10 minutes)

1. **Pause switch validation**
   - Run `npm run owner:command-center -- --network hardhat --format markdown --out reports/zenith-omnidominion/pause-drill.md --execute-pause-check`.
   - Ensure the resulting markdown shows `SystemPause.setPaused(true)` followed by `false` to simulate a halt/resume cycle.
2. **Thermostat hotfix rehearsal**
   - `npx hardhat run scripts/v2/updateThermostat.ts --network hardhat --temperature 0.31 --dry-run`
   - Confirm output indicates owner signature required; do **not** append `--execute` during drills.
3. **Dispute circuit orientation**
   - Review `docs/disputes.md` and ensure the `StakeManager` commands listed there align with `OWNER-CONTROL.md` entries.

## Post-mission (10 minutes)

1. **Archive the kit**
   - Compress `reports/zenith-omnidominion/zenith-omnidominion-kit.json` and supporting markdown files.
   - Upload to long-term storage per organisational policy.
2. **Update mission log**
   - Append a summary to the internal mission tracker referencing the kit hash and CI run ID.
3. **Reset environment**
   - Remove temporary reports with `rm -rf reports/zenith-omnidominion` if the archive is complete.
   - `git clean -fd` to ensure the workspace is clean for the next run.

## Troubleshooting quick reference

| Symptom | Diagnostic | Resolution |
| --- | --- | --- |
| `Step owner-command-center failed` | Inspect `reports/zenith-omnidominion/logs/owner-command-center.log` | Run `npm run owner:verify-control -- --network hardhat` to locate mismatched owner addresses. |
| Dry-run rejects plan | `reports/zenith-omnidominion/dry-run.json` contains failure scenario | Adjust plan parameters or run `npm run owner:mission-control -- --network hardhat` for deeper context. |
| Thermodynamics report missing | Check `ASI_GLOBAL_THERMODYNAMICS_PATH` env variable | Ensure the shell wrapper was used; do not call `demo:asi-global` directly for this initiative. |
| Mermaid diagram is empty | `reports/zenith-omnidominion/governance.mmd` not generated | Run `npm run owner:diagram -- --network hardhat --out reports/zenith-omnidominion/governance.md --title "OmniDominion Governance"`. |

Store this runbook alongside the mission plan so future operators inherit the same procedure.
