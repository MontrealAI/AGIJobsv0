# OmniSovereign Operator Runbook

This runbook codifies the deterministic drill that fuses the national take-off mission
with the planetary orchestrator, producing a composite dossier that can be replayed in CI
or audited post-facto.  Only scripts that already exist in this repository are used.

---

## 1. Environment Preparation

1. Install dependencies and toolchains:
   ```bash
   npm ci
   foundryup
   ```
2. Export override keys if deviating from defaults:
   ```bash
   export PRIVATE_KEY=...
   export AURORA_WORKER_KEY=...
   export AURORA_VALIDATOR1_KEY=...
   export AURORA_VALIDATOR2_KEY=...
   export AURORA_VALIDATOR3_KEY=...
   ```
3. Prime environment configuration:
   ```bash
   cp demo/asi-takeoff/env.example .env
   ```

---

## 2. Stage National Automation Loop

1. Launch the deterministic local mission:
   ```bash
   npm run demo:asi-takeoff:local
   ```
2. Confirm core artefacts:
   - `reports/localhost/asi-takeoff/receipts/mission.json`
   - `reports/localhost/asi-takeoff/receipts/jobs/<slug>/*.json`
   - `reports/localhost/asi-takeoff/receipts/governance.json`
   - `reports/localhost/asi-takeoff/asi-takeoff-report.md`
3. Rebuild the governance kit (optional, but recommended when integrating into CI):
   ```bash
   npm run demo:asi-takeoff:kit -- \
     --report-root reports/localhost/asi-takeoff \
     --plan demo/omnisovereign/project-plan.omnisovereign.json \
     --summary-md reports/localhost/asi-takeoff/asi-takeoff-report.md \
     --bundle reports/localhost/asi-takeoff/receipts
   ```

---

## 3. Execute Planetary Coordination Drill

1. Run the deterministic planetary scenario (no additional code required):
   ```bash
   npm run demo:asi-global
   ```
2. Capture the mission dossier:
   - `reports/asi-global/receipts/mission.json`
   - `reports/asi-global/receipts/regions/<region>/`
   - `reports/asi-global/asi-global-report.md`
   - `reports/asi-global/governance-kit.{json,md}`
3. If running against a local node, the interactive mode is available:
   ```bash
   npm run demo:asi-global:local
   ```

---

## 4. Owner Command Consolidation

1. Generate a unified command center snapshot:
   ```bash
   AURORA_DEPLOY_OUTPUT=reports/localhost/asi-takeoff/receipts/deploy.json \
   RPC_URL=http://127.0.0.1:8545 CHAIN_ID=31337 \
   npm run owner:command-center -- --network localhost --format markdown
   ```
2. Produce auxiliary dashboards:
   ```bash
   npm run owner:mission-control -- --network localhost --format markdown
   npm run owner:parameters -- --network localhost --format markdown
   npm run owner:dashboard -- --network localhost --format markdown
   npm run owner:diagram -- --network localhost --out reports/localhost/asi-takeoff/owner.mmd
   ```
3. Verify pause authority alignment:
   ```bash
   RPC_URL=http://127.0.0.1:8545 CHAIN_ID=31337 npm run pause:test
   ```

---

## 5. Thermodynamic & Incentive Alignment

1. Render the composite thermodynamic report to align incentive gradients across layers:
   ```bash
   npm run thermodynamics:report -- --plan demo/omnisovereign/project-plan.omnisovereign.json \
     --report-root reports/localhost/asi-takeoff
   ```
2. Optionally, update thermostat parameters using the existing script:
   ```bash
   npm run thermostat:update -- --network localhost --plan demo/asi-takeoff/asi-takeoff.thermostat@v2.json
   ```
3. Cross-validate reward distribution envelopes:
   ```bash
   npm run reward-engine:update -- --network localhost
   ```

---

## 6. Validator Oversight & Transparency

1. Inspect validator receipts generated in both missions.
2. Reproduce commit/reveal locally when necessary:
   ```bash
   RPC_URL=http://127.0.0.1:8545 CHAIN_ID=31337 \
   npx ts-node --transpile-only examples/commit-reveal.js --job 1
   ```
3. Publish the combined governance kits as CI artefacts for downstream audit teams.

---

## 7. Continuity & Cleanup

1. Archive the composite dossier:
   - `reports/localhost/asi-takeoff/**`
   - `reports/asi-global/**`
   - `demo/omnisovereign/project-plan.omnisovereign.json`
2. Shut down the local node if still active:
   ```bash
   pkill -f "[a]nvil" || true
   pkill -f "hardhat node" || true
   ```
3. Reset workspace (optional):
   ```bash
   rm -rf reports/localhost/asi-takeoff
   rm -rf reports/asi-global
   ```

The OmniSovereign drill now stands as a reproducible dossier demonstrating how the
existing AGI Jobs v0 (v2) stack coordinates city, national, and planetary missions under
unified owner control.
