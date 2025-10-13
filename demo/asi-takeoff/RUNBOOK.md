# ASI Take-Off Operations Runbook

This runbook demonstrates how to execute the autonomous governance drill end-to-end while preserving owner control, validator oversight, and thermodynamic incentives.

---

## 1. Environment Preparation

1. Install dependencies (`npm ci`) and Foundry toolchain (`foundryup`).
2. Export demo keys if overriding defaults:
   ```bash
   export PRIVATE_KEY=...
   export AURORA_WORKER_KEY=...
   export AURORA_VALIDATOR1_KEY=...
   export AURORA_VALIDATOR2_KEY=...
   export AURORA_VALIDATOR3_KEY=...
   ```
3. Copy the example environment file:
   ```bash
   cp demo/asi-takeoff/env.example .env
   ```

## 2. Launch Mission Locally

```bash
npm run demo:asi-takeoff:local
```

The script performs:

- Spins up Anvil/Hardhat node.
- Deploys v2 defaults with deterministic addresses.
- Runs `aurora.demo.ts` with `mission@v2.json`, producing receipts under `reports/localhost/asi-takeoff/`.
- Generates `asi-takeoff-report.md` summarising the mission.

## 3. Artefact Inspection

- `reports/localhost/asi-takeoff/receipts/mission.json` – high-level summary of all jobs.
- `reports/localhost/asi-takeoff/receipts/jobs/<slug>/` – per-job post/submit/validate/finalize receipts.
- `reports/localhost/asi-takeoff/receipts/stake.json` – stake acknowledgements.
- `reports/localhost/asi-takeoff/receipts/governance.json` – pause drills, stake minimum adjustments, validator pool updates.
- `reports/localhost/asi-takeoff/asi-takeoff-report.md` – Markdown mission dossier.
- `reports/asi-takeoff/governance-kit.{json,md}` – deterministic control-plane manifest with SHA-256 hashes.

Rebuild the governance kit for the local receipts if necessary:

```bash
npm run demo:asi-takeoff:kit -- --report-root reports/localhost/asi-takeoff --plan demo/asi-takeoff/project-plan.json --summary-md reports/localhost/asi-takeoff/asi-takeoff-report.md --bundle reports/localhost/asi-takeoff/receipts
```

## 4. Owner Control Validations

Run owner control drills against the deployed environment:

```bash
AURORA_DEPLOY_OUTPUT=reports/localhost/asi-takeoff/receipts/deploy.json \
RPC_URL=http://127.0.0.1:8545 \
CHAIN_ID=31337 \
npm run owner:command-center -- --network localhost
```

Execute pause drill (should match receipts recorded in the mission run):

```bash
RPC_URL=http://127.0.0.1:8545 CHAIN_ID=31337 npm run pause:test
```

Generate owner control snapshot:

```bash
AURORA_DEPLOY_OUTPUT=reports/localhost/asi-takeoff/receipts/deploy.json \
RPC_URL=http://127.0.0.1:8545 CHAIN_ID=31337 \
npm run owner:dashboard -- --network localhost
```

## 5. Validator Oversight

- Receipts capture each validator commit + reveal with salts.
- To reproduce the commit/reveal locally, run:
  ```bash
  RPC_URL=http://127.0.0.1:8545 CHAIN_ID=31337 \
  npx ts-node --transpile-only examples/commit-reveal.js --job 1
  ```
  (Adjust `--job` for the corresponding mission job ID.)

## 6. Mission Extensions

- Modify `mission@v2.json` to add additional jobs or adjust rewards/stakes.
- Update `asi-takeoff.thermostat@v2.json` to retune incentive temperature envelopes.
- Regenerate mission report via `npm run demo:asi-takeoff:report`.

## 7. Cleaning Up

Stop the local node if still running:

```bash
pkill -f "[a]nvil" || true
pkill -f "hardhat node" || true
```

Clear previous artefacts:

```bash
rm -rf reports/localhost/asi-takeoff
```

---

This runbook, combined with `mission.json`, forms a reproducible dossier demonstrating autonomous multi-sector coordination under owner governance.
