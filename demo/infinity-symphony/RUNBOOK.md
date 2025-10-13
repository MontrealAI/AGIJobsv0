# Infinity Symphony Runbook — Operator Drill

This runbook turns Infinity Symphony into a reproducible, audit-ready demonstration. Every step relies on existing AGI Jobs v0 (v2) scripts. The flow assumes access to a mainnet-equivalent RPC or Anvil fork and can be executed unattended inside CI.

## 0. Preconditions

- Install dependencies (`npm install`) and ensure `ts-node` is available via the repo toolchain.
- Export a network context (`NETWORK=localhost`, `NETWORK=sepolia`, or custom mainnet RPC via Hardhat).
- If broadcasting, provision a funded deployer key using the `DEPLOYER_PRIVATE_KEY` env variable (CI path stays offline).

## 1. Mission Environment Bootstrap

1. Copy the environment overlay:
   ```bash
   cp demo/infinity-symphony/env.example .env
   ```
2. Double-check the mission paths:
   - `AURORA_MISSION_CONFIG` → `demo/infinity-symphony/config/mission@v2.json`
   - `AURORA_THERMOSTAT_CONFIG` → `demo/infinity-symphony/config/infinity-symphony.thermostat@v2.json`
   - `AURORA_REPORT_SCOPE` → `infinity-symphony`
3. Optional: override `ASI_TAKEOFF_PLAN_PATH` to a forked charter before running automation.

## 2. Deterministic Dry-Run Harness

1. Execute the dry-run pipeline with the Infinity plan:
   ```bash
   export ASI_TAKEOFF_PLAN_PATH=demo/infinity-symphony/project-plan.json
   npm run demo:asi-takeoff
   ```
2. Inspect `reports/asi-takeoff/mission-control.md` and confirm the scenarios labelled `Global Stabilisation`, `Emergency Swarm`, and `Trade Equilibrium` all read `status: pass`.
3. Run the governance kit generator for completeness:
   ```bash
   npm run demo:asi-takeoff:kit -- \
     --report-root reports/asi-takeoff \
     --summary-md reports/asi-takeoff/infinity-symphony-summary.md \
     --bundle reports/asi-takeoff/mission-bundle \
     --logs reports/asi-takeoff/logs
   ```
4. Hash the receipts (optional, recommended for CI):
   ```bash
   find reports/asi-takeoff -type f -print0 | sort -z | xargs -0 shasum -a 256 > reports/asi-takeoff/SHA256SUMS
   ```

## 3. Mission Compendium (AURORA)

1. Mirror the dry-run outputs into the Infinity scope:
   ```bash
   mkdir -p reports/localhost/infinity-symphony/receipts
   rsync -a reports/asi-takeoff/ reports/localhost/infinity-symphony/receipts/
   ```
2. Render the mission report:
   ```bash
   npm run demo:aurora:report
   ```
3. Verify `reports/localhost/infinity-symphony/infinity-symphony-report.md` contains the four mission jobs and thermostat overlays.

## 4. Owner Command Fabric Proofs

1. Atlas parameter lattice:
   ```bash
   npm run owner:atlas -- --format markdown --output reports/localhost/infinity-symphony/governance/atlas.md
   ```
2. Command center dossier:
   ```bash
   npm run owner:command-center -- --format markdown --output reports/localhost/infinity-symphony/governance/command-center.md --network ${NETWORK:-localhost}
   ```
3. Mission control workbook:
   ```bash
   npm run owner:mission-control -- --output reports/localhost/infinity-symphony/governance/mission-control.md --network ${NETWORK:-localhost}
   ```
4. Render the owner governance mermaid diagram for verification:
   ```bash
   npm run owner:diagram -- --output reports/localhost/infinity-symphony/governance/control.mmd --network ${NETWORK:-localhost}
   ```

````mermaid
stateDiagram-v2
    [*] --> DryRun
    DryRun --> Receipts
    Receipts --> Atlas
    Receipts --> CommandCenter
    CommandCenter --> MissionControl
    MissionControl --> Publish
    Atlas --> Publish
    Publish --> [*]
````

## 5. Thermostat & Economic Audits

1. Generate the thermodynamics report:
   ```bash
   npm run thermodynamics:report -- --output reports/localhost/infinity-symphony/governance/thermodynamics.md
   ```
2. Trigger the owner parameter matrix (CI gating):
   ```bash
   npm run owner:parameters -- --output reports/localhost/infinity-symphony/governance/parameter-matrix.md --network ${NETWORK:-localhost}
   ```
3. Optional: run the Hamiltonian tracker for energy policy overlays:
   ```bash
   npm run hamiltonian:report -- --output reports/localhost/infinity-symphony/governance/hamiltonian.md --network ${NETWORK:-localhost}
   ```

## 6. Publication Surface

1. Summarise artefacts:
   ```bash
   tree reports/localhost/infinity-symphony
   ```
2. Pin or archive:
   - `ipfs-car` / `web3.storage` for decentralised publication.
   - `git lfs` or artifact storage for CI.
3. Announce via ENS text records using `npm run identity:update` if mainnet ready.

## 7. Regression / CI Hooks

- **CI gating:** Fail the pipeline if `reports/asi-takeoff/SHA256SUMS` changes unexpectedly.
- **Drift detection:** Run `npm run owner:verify-control` after the harness to assert owner supremacy wiring.
- **Incident drill:** Pair this runbook with `npm run owner:emergency` to test pause / resume loops.

Infinity Symphony stays completely inside AGI Jobs v0 (v2) functionality, yet surfaces the civilisation-grade intelligence choreography referenced in our mandate.
