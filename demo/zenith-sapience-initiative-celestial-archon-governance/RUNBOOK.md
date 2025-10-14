# Celestial Archon Mission Runbook

This runbook exposes every stage of the deterministic
`npm run demo:zenith-sapience-celestial-archon` pipeline. All commands rely on
existing AGI Jobs v0 (v2) tooling — no bespoke scripts are introduced.

## 1. Pre-Flight Assurances

- Confirm **Node.js 20.x** and **npm** are installed.
- (Optional) Install **Foundry** to unlock the local rehearsal harness.
- Verify contract wiring and SystemPause authority:

  ```bash
  npm run owner:health
  npm run owner:verify-control -- --network hardhat
  ```

  These checks confirm multisig ownership, pause authority, and treasury routes
  before orchestration begins.

## 2. Deterministic Governance Kit

1. Launch the Celestial Archon wrapper:

   ```bash
   npm run demo:zenith-sapience-celestial-archon
   ```

   Under the hood the wrapper executes:

   - `scripts/generate-constants.ts` — regenerates protocol constants.
   - `hardhat compile` — ensures bytecode parity with production deployments.
   - `scripts/v2/testnetDryRun.ts --json` — simulates the global job lifecycle.
   - `scripts/v2/thermodynamicsReport.ts` — captures incentive telemetry.
   - `scripts/v2/ownerMissionControl.ts` — renders the mission dossier.
   - `scripts/v2/ownerCommandCenter.ts` & `ownerParameterMatrix.ts` — owner knob
     catalogues.
   - `scripts/v2/renderOwnerMermaid.ts` — generates governance diagrams.
   - `scripts/v2/verifyOwnerControl.ts` — revalidates owner supremacy.
   - `scripts/v2/lib/asiTakeoffKit.ts` — bundles the Celestial Archon kit with
     SHA-256 manifests.

2. Review the generated assets:

   ```bash
   tree reports/zenith-celestial-archon -L 1
   cat reports/zenith-celestial-archon/summary.md
   ```

3. Archive the governance kit (optional):

   ```bash
   cp reports/zenith-celestial-archon/zenith-celestial-archon-kit.* ~/Desktop/
   ```

## 3. Local Rehearsal Loop (Optional)

1. Execute the local harness with ephemeral Hardhat/Anvil services:

   ```bash
   npm run demo:zenith-sapience-celestial-archon:local
   ```

   This spins up the default deployment, replays validator attestations, and
   captures Aurora agent telemetry under `reports/localhost/zenith-celestial-archon/`.

2. Inspect receipts and mission events:

   ```bash
   tree reports/localhost/zenith-celestial-archon -L 2
   ```

## 4. Parameter Adjustment Drills

All owner commands run in **dry-run mode** by default; append `--execute` only
with explicit human approval.

| Objective | Command |
| --- | --- |
| Pause or resume the entire platform | `npm run owner:command-center -- --network hardhat --format markdown --out reports/zenith-celestial-archon/command-center.md` |
| Raise global incentive temperature (preview) | `npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts --network hardhat --temperature 0.36 --preview` |
| Apply emergency temperature | `npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts --network hardhat --temperature 0.48 --execute` |
| Redirect treasury flow | `npx hardhat run --no-compile scripts/v2/updateFeePool.ts --network hardhat --treasury 0xTREASURY-NEW --preview` |
| Rotate governor delegates | `npm run owner:rotate -- --network hardhat --plan demo/zenith-sapience-initiative-celestial-archon-governance/project-plan.json` |

Always capture resulting reports in `reports/zenith-celestial-archon/` for audit parity.

## 5. Incident & Recovery Scenarios

1. **Emergency Pause Drill** — run `npm run owner:command-center` and follow the
   generated instructions to call `SystemPause.pause()`. Confirm
   `reports/zenith-celestial-archon/mission-control.md` reflects `paused: true`.
2. **Dispute Simulation** — exercise validator dispute flows using the existing
   harness:

   ```bash
   npm run disputes:sim -- --network hardhat
   ```

3. **Thermostat Reset** — restore baseline parameters:

   ```bash
   npx hardhat run --no-compile scripts/v2/updateThermodynamics.ts --network hardhat --load config/thermodynamics.json
   ```

4. **Governance Upgrade Planning** — compile a Safe transaction bundle for any
   contract upgrade sequence:

   ```bash
   npm run owner:plan:safe -- --output reports/zenith-celestial-archon/upgrade-plan.json
   ```

## 6. Post-Run Verification

- Re-run `npm run owner:verify-control -- --network hardhat` to certify owner
  dominance after every rehearsal.
- Hash the kit for archival integrity:

  ```bash
  shasum -a 256 reports/zenith-celestial-archon/zenith-celestial-archon-kit.json
  ```

- Document notable actions in `reports/zenith-celestial-archon/mission-control.md`.

---

Following this runbook keeps the Celestial Archon demonstration deterministic,
auditable, and ready for executive or regulator inspection without any custom
code.
