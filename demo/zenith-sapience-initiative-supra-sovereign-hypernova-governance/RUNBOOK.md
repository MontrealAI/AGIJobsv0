# Hypernova Mission Runbook

This runbook mirrors the deterministic `npm run demo:zenith-hypernova` wrapper while
surfacing each stage for inspection. Every command delegates to existing scripts in this
repository; no bespoke automation is introduced.

## 1. Pre-Flight Checks

- Ensure **Node.js 20.x** and **npm** are installed.
- (Optional) Install **Foundry** if you plan to run the local rehearsal via Anvil.
- Confirm contract health and owner wiring:

  ```bash
  npm run owner:health
  npm run owner:verify-control -- --network hardhat
  ```

  These verify SystemPause, multisig ownership, treasury custody, and parameter access.

## 2. Deterministic Governance Kit

1. Execute the Hypernova wrapper (exports environment overrides only):

   ```bash
   npm run demo:zenith-hypernova
   ```

   Behind the scenes this performs:

   - `scripts/generate-constants.ts` – regenerates protocol constants.
   - `hardhat compile` – re-compiles contracts to match generated artefacts.
   - `scripts/v2/testnetDryRun.ts --json` – simulates the complete job lifecycle with
     thermodynamic adjustments.
   - `scripts/v2/thermodynamicsReport.ts` – records entropy/temperature telemetry.
   - `scripts/v2/ownerMissionControl.ts` – emits the governance dossier.
   - `scripts/v2/ownerCommandCenter.ts` / `ownerParameterMatrix.ts` – enumerates owner
     controls.
   - `scripts/v2/renderOwnerMermaid.ts` – renders governance topology diagrams.
   - `scripts/v2/verifyOwnerControl.ts` – reconfirms owner supremacy.
   - `scripts/v2/lib/asiTakeoffKit.ts` – bundles the governance kit with SHA-256 hashes.

2. Inspect the output:

   ```bash
   tree reports/zenith-hypernova -L 1
   cat reports/zenith-hypernova/summary.md
   ```

3. Archive the governance kit for auditors (optional):

   ```bash
   cp reports/zenith-hypernova/zenith-hypernova-governance-kit.* ~/Desktop/
   ```

## 3. Local Rehearsal (Optional)

1. Launch the local harness:

   ```bash
   npm run demo:zenith-hypernova:local
   ```

   This spins up Hardhat/Anvil, deploys defaults via `scripts/v2/deployDefaults.ts`, and
   runs the aurora agent pipeline with Hypernova scope (`AURORA_REPORT_SCOPE=zenith-hypernova`).

2. Examine receipts:

   ```bash
   tree reports/localhost/zenith-hypernova -L 2
   ```

## 4. Parameter & Control Drills

All owner commands run in **dry-run mode** unless `--execute` is supplied. Capture the
resulting artefacts in `reports/zenith-hypernova/` for audit evidence.

| Objective | Command |
| --- | --- |
| Pause/resume the entire system | `npm run owner:command-center -- --network hardhat --format markdown --out reports/zenith-hypernova/command-center.md` (follow the generated instructions to pause or resume). |
| Raise global temperature in an emergency | `npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts --network hardhat --temperature 0.45 --preview` |
| Apply the change on-chain after approval | `npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts --network hardhat --temperature 0.45 --execute` |
| Redirect treasury fees | `npx hardhat run --no-compile scripts/v2/updateFeePool.ts --network hardhat --preview` |
| Rotate governor delegates | `npm run owner:rotate -- --network hardhat --plan demo/zenith-sapience-initiative-supra-sovereign-hypernova-governance/project-plan.json` |
| Refresh identity snapshot | `npm run identity:update -- --plan reports/zenith-hypernova/identity-plan.json` |

## 5. Incident & Recovery Drills

1. **Emergency Pause** – trigger via `npm run owner:command-center`; confirm
   `mission-control.md` shows `paused: true`.
2. **Dispute Simulation** – exercise the built-in dispute harness:

   ```bash
   npm run disputes:sim -- --network hardhat
   ```

   Demonstrates validator slashing and job reissue.
3. **Thermostat Reset** – restore baseline thermodynamics after a drill:

   ```bash
   npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts --network hardhat --load config/thermodynamics.json
   ```
4. **Governance Upgrade Rehearsal** – generate a Safe transaction bundle:

   ```bash
   npm run owner:plan:safe -- --output reports/zenith-hypernova/upgrade-plan.json
   ```

   Review with signers before submission.

## 6. Post-Run Verification

- Re-run `npm run owner:verify-control -- --network hardhat`.
- Hash the kit for immutable archival:

  ```bash
  shasum -a 256 reports/zenith-hypernova/zenith-hypernova-governance-kit.json
  ```

- Document governance actions in `reports/zenith-hypernova/mission-control.md`.

---

Following this runbook keeps the Hypernova demo deterministic, auditable, and deployable
by non-technical stewards with minimal effort.
