# Zenith Sapience Mission Runbook

This runbook mirrors the deterministic `npm run demo:zenith-sapience-initiative`
pipeline while exposing each stage for inspection. Every command is built from
existing scripts in this repository.

## 1. Pre-Flight Checks

- Ensure **Node.js 20.x** and **npm** are installed.
- (Optional) Install **Foundry** if you plan to run local rehearsals via Anvil.
- Run the contract health check:

  ```bash
  npm run owner:health
  npm run owner:verify-control -- --network hardhat
  ```

  These commands confirm SystemPause, multisig, and treasury ownership wiring.

## 2. Deterministic Governance Kit

1. Execute the wrapper (uses only environment overrides):

   ```bash
   npm run demo:zenith-sapience-initiative
   ```

   Under the hood this performs:

   - `scripts/generate-constants.ts` – regenerates protocol constants.
   - `hardhat compile` – guarantees contract bytecode is up to date.
   - `scripts/v2/testnetDryRun.ts --json` – simulates the full job lifecycle.
   - `scripts/v2/thermodynamicsReport.ts` – captures incentive telemetry.
   - `scripts/v2/ownerMissionControl.ts` – produces the mission dossier.
   - `scripts/v2/ownerCommandCenter.ts` / `ownerParameterMatrix.ts` – owner knobs.
   - `scripts/v2/renderOwnerMermaid.ts` – renders governance diagrams.
   - `scripts/v2/verifyOwnerControl.ts` – re-verifies owner supremacy.
   - `scripts/v2/lib/asiTakeoffKit.ts` – bundles the governance kit with SHA-256 hashes.

2. Review output:

   ```bash
   tree reports/zenith-sapience -L 1
   cat reports/zenith-sapience/summary.md
   ```

3. Archive the governance kit (optional):

   ```bash
   cp reports/zenith-sapience/zenith-sapience-initiative-kit.* ~/Desktop/
   ```

## 3. Local Rehearsal (Optional)

1. Start the local rehearsal harness:

   ```bash
   npm run demo:zenith-sapience-initiative:local
   ```

   This launches Anvil/Hardhat, deploys defaults via `scripts/v2/deployDefaults.ts`, and
   runs the aurora agent pipeline with Zenith scope (`AURORA_REPORT_SCOPE=zenith-sapience`).

2. Inspect receipts:

   ```bash
   tree reports/localhost/zenith-sapience -L 2
   ```

## 4. Parameter Adjustment Drills

All owner commands run in **dry-run mode** unless `--execute` is provided.

| Objective | Command |
| --- | --- |
| Pause/resume the entire system | `npm run owner:command-center -- --network hardhat --format markdown --out reports/zenith-sapience/command-center.md` (then follow pause instructions inside). |
| Raise global temperature in an emergency | `npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts --network hardhat --temperature 0.42` |
| Redirect treasury fees | `npx hardhat run --no-compile scripts/v2/updateFeePool.ts --network hardhat --preview` |
| Rotate governor delegates | `npm run owner:rotate -- --network hardhat --plan demo/zenith-sapience-initiative-global-governance/project-plan.json` |

Always capture the resulting artefacts in `reports/zenith-sapience/` to preserve the audit trail.

## 5. Incident & Recovery Playbook

1. **Emergency Pause** – trigger via `npm run owner:command-center` (follow the generated
   instructions). Confirm `reports/zenith-sapience/mission-control.md` shows `paused: true`.
2. **Dispute Drill** – execute the existing dispute harness:

   ```bash
   npm run disputes:sim -- --network hardhat
   ```

   This demonstrates validator slashing and reissue flow.
3. **Thermostat Reset** – restore baseline values via:

   ```bash
   npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts --network hardhat --load config/thermodynamics.json
   ```
4. **Governance Upgrade Simulation** – build a Safe transaction bundle:

   ```bash
   npm run owner:plan:safe -- --output reports/zenith-sapience/upgrade-plan.json
   ```

   Submit only after human sign-off.

## 6. Post-Run Verification

- Re-run `npm run owner:verify-control -- --network hardhat`.
- Hash the kit for immutable archival:

  ```bash
  shasum -a 256 reports/zenith-sapience/zenith-sapience-initiative-kit.json
  ```

- Document any governance actions in `reports/zenith-sapience/mission-control.md`.

---

Following this runbook keeps the demo deterministic, fully auditable, and ready for
executive review without any bespoke tooling.
