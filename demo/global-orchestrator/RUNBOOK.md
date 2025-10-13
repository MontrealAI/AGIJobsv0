# Global Autonomous Economic Orchestrator — Operations Runbook

This runbook documents the deterministic operator workflow for executing the global renewable coordination drill end-to-end.
It extends the existing ASI take-off tooling while preserving owner control, validator oversight, and emergency braking.

---

## 1. Environment Preparation

1. Install dependencies (`npm ci`) and Foundry toolchain (`foundryup`).
2. Export custom signer keys when overriding defaults:
   ```bash
   export PRIVATE_KEY=...
   export AURORA_WORKER_KEY=...
   export AURORA_VALIDATOR1_KEY=...
   export AURORA_VALIDATOR2_KEY=...
   export AURORA_VALIDATOR3_KEY=...
   ```
3. Copy the example environment file:
   ```bash
   cp demo/global-orchestrator/env.example .env
   ```

## 2. Launch Mission Locally

```bash
npm run demo:global-orchestrator:local
```

The script performs:

- Spins up an Anvil/Hardhat node with deterministic chain state.
- Deploys the v2 defaults and registers the planetary identities.
- Executes `aurora.demo.ts` with `mission@v2.json`, recording receipts under
  `reports/localhost/global-orchestrator/`.
- Generates `global-orchestrator-report.md` summarising the mission.

## 3. Artefact Inspection

- `reports/localhost/global-orchestrator/receipts/mission.json` – orchestrator overview.
- `reports/localhost/global-orchestrator/receipts/jobs/<slug>/` – per-job post/submit/validate/finalise receipts.
- `reports/localhost/global-orchestrator/receipts/stake.json` – stake acknowledgements.
- `reports/localhost/global-orchestrator/receipts/governance.json` – thermostat tuning, pause drills, validator updates.
- `reports/localhost/global-orchestrator/global-orchestrator-report.md` – Markdown dossier.

## 4. Owner Control Validations

Run the owner command centre against the deployed environment:

```bash
AURORA_DEPLOY_OUTPUT=reports/localhost/global-orchestrator/receipts/deploy.json \
RPC_URL=http://127.0.0.1:8545 \
CHAIN_ID=31337 \
npm run owner:command-center -- --network localhost
```

Execute pause drill (mirrors the deterministic receipts logged during the mission run):

```bash
RPC_URL=http://127.0.0.1:8545 CHAIN_ID=31337 npm run pause:test
```

Generate the owner control dashboard:

```bash
AURORA_DEPLOY_OUTPUT=reports/localhost/global-orchestrator/receipts/deploy.json \
RPC_URL=http://127.0.0.1:8545 CHAIN_ID=31337 \
npm run owner:dashboard -- --network localhost
```

## 5. Validator Oversight

- Receipts capture each validator commit + reveal cycle, including salts.
- Re-run a commit/reveal locally to validate transparency:
  ```bash
  RPC_URL=http://127.0.0.1:8545 CHAIN_ID=31337 \
  npx ts-node --transpile-only examples/commit-reveal.js --job 1
  ```
  (Adjust `--job` to reference the mission job ID in question.)

## 6. Thermodynamic Steering

- Update role and system temperatures via the provided config:
  ```bash
  AURORA_THERMOSTAT_CONFIG=demo/global-orchestrator/config/global-orchestrator.thermostat@v2.json \
  npx ts-node --compiler-options '{"module":"commonjs"}' scripts/v2/updateThermostat.ts --network localhost
  ```
- Regenerate thermodynamic reports for audit trails:
  ```bash
  npm run thermodynamics:report
  ```

## 7. Mission Extensions

- Modify `mission@v2.json` to add additional continents, humanitarian tasks, or treasury operations.
- Update `spec-*.json` with revised stakes or validation quorums and rerun the demo.
- Append new KPIs to `project-plan.json` to reflect emerging policy requirements.

## 8. Cleaning Up

Stop the local node if still running:

```bash
pkill -f "[a]nvil" || true
pkill -f "hardhat node" || true
```

Clear previous artefacts:

```bash
rm -rf reports/localhost/global-orchestrator
```

---

This runbook, alongside the mission config and deterministic CI harness, forms a reproducible dossier that demonstrates
planetary-scale autonomous coordination with strict owner controls.
