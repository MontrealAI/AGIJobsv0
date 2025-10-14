# Zenith Sapience – Transcendent Governance Runbook

This runbook operationalises the **AGI Jobs v0 – ASI Governance Demonstration
Overview** request. It exposes every step behind
`npm run demo:zenith-sapience-transcendent`, ensuring a non-technical steward can
replay the entire governance cycle with full audit coverage.

All commands rely exclusively on scripts already present in this repository.
Unless stated otherwise they execute in preview/dry-run mode.

## 1. Pre-flight Verification

1. Install prerequisites from [docs/setup.md](../../docs/setup.md) (Node.js 20,
   npm, optional Foundry).
2. Confirm environment health:

   ```bash
   npm run owner:health
   npm run owner:verify-control -- --network hardhat
   ```

   These checks verify SystemPause, multisig ownership, treasury wiring, and
   governor/timelock alignment.

## 2. Build the Deterministic Governance Kit

1. Launch the transcendent wrapper:

   ```bash
   npm run demo:zenith-sapience-transcendent
   ```

   This command wraps `scripts/v2/asiGlobalDemo.ts` and internally performs:

   - `scripts/generate-constants.ts`
   - `hardhat compile`
   - `scripts/v2/testnetDryRun.ts --json`
   - `scripts/v2/thermodynamicsReport.ts`
   - `scripts/v2/ownerMissionControl.ts`
   - `scripts/v2/ownerCommandCenter.ts`
   - `scripts/v2/ownerParameterMatrix.ts`
   - `scripts/v2/renderOwnerMermaid.ts`
   - `scripts/v2/verifyOwnerControl.ts`
   - `scripts/v2/lib/asiTakeoffKit.ts`

2. Inspect artefacts:

   ```bash
   tree reports/zenith-sapience-transcendent -L 1
   cat reports/zenith-sapience-transcendent/summary.md
   ```

3. Archive the governance kit for auditors (optional):

   ```bash
   cp reports/zenith-sapience-transcendent/zenith-sapience-transcendent-kit.* ~/Desktop/
   ```

## 3. Local Rehearsal Loop (Optional)

1. Execute the local rehearsal harness (Hardhat/Anvil + Aurora report):

   ```bash
   npm run demo:zenith-sapience-transcendent:local
   ```

   - Deploys defaults via `scripts/v2/deployDefaults.ts`.
   - Runs the Aurora mission report generator with
     `AURORA_REPORT_SCOPE=zenith-sapience-transcendent` and
     `AURORA_REPORT_TITLE='Zenith Sapience – Transcendent Mission Report'`.

2. Review local artefacts:

   ```bash
   tree reports/localhost/zenith-sapience-transcendent -L 2
   ```

## 4. Owner Parameter & Control Drills

All owner commands remain dry-run unless `--execute` is appended.

| Objective | Command |
| --- | --- |
| Pause/resume the entire system | `npm run owner:command-center -- --network hardhat --format markdown --out reports/zenith-sapience-transcendent/command-center.md` |
| Increase incentive temperature during emergencies | `npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts --network hardhat --temperature 0.42` |
| Restore baseline thermodynamics | `npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts --network hardhat --load config/thermodynamics.json` |
| Redirect treasury fees | `npx hardhat run --no-compile scripts/v2/updateFeePool.ts --network hardhat --preview` |
| Rotate governor delegates | `npm run owner:rotate -- --network hardhat --plan demo/zenith-sapience-initiative-transcendent-governance-overview/project-plan.json` |
| Generate parameter matrix | `npm run owner:parameters -- --network hardhat --format markdown --out reports/zenith-sapience-transcendent/parameter-matrix.md` |

## 5. Incident & Recovery Exercises

1. **Emergency Pause Drill** – run the command-centre workflow above and follow
   the generated checklist. Confirm
   `reports/zenith-sapience-transcendent/mission-control.md` reflects `paused:
   true`.
2. **Validator Dispute Simulation** – demonstrate slashing workflow:

   ```bash
   npm run disputes:sim -- --network hardhat
   ```

3. **Mission Telemetry Review** – open
   `reports/zenith-sapience-transcendent/thermodynamics.json` and
   `mission-control.md` to verify entropy and reward splits remain within bounds.
4. **Governance Upgrade Rehearsal** – build a Safe transaction bundle for future
   upgrades:

   ```bash
   npm run owner:plan:safe -- --output reports/zenith-sapience-transcendent/upgrade-plan.json
   ```

   Obtain human sign-off before executing any upgrade sequence.

## 6. Post-Run Assurance

1. Re-run `npm run owner:verify-control -- --network hardhat` to confirm owner
   supremacy.
2. Hash the governance kit for immutable archival:

   ```bash
   shasum -a 256 reports/zenith-sapience-transcendent/zenith-sapience-transcendent-kit.json
   ```

3. Store the generated mission dossier, command centre, and parameter matrix in
   your compliance archive.

---

Following this runbook keeps the demo deterministic, reproducible, and ready for
executive inspection without modifying any core contract or deployment script.
