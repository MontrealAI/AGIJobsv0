# AURORA Runbook (Operators)

> Assumes `.env` configured (RPC_URL, PRIVATE_KEY / SAFE settings if needed).

## Local (Anvil)

```bash
npm run demo:aurora:local
```

This:

1. Boots `anvil`.
2. Deploys v2 defaults (`scripts/v2/deployDefaults.ts`) with verification disabled for speed and writes a deployment summary.
3. Mints mock `$AGIALPHA`, configures validator bounds, and runs the full job lifecycle end‑to‑end.
4. Captures receipts + owner snapshots, and
5. Writes `aurora-report.md` summarising the mission.

## Target network

```bash
# set RPC_URL, CHAIN_ID, signer keys and module addresses
npm run demo:aurora:sepolia
```

Preparation checklist:

1. Produce a deployment summary (`npx hardhat run scripts/v2/deployDefaults.ts --network <network>`) and set `AURORA_DEPLOY_OUTPUT` to its JSON file, **or** export explicit contract overrides via `AURORA_JOB_REGISTRY`, `AURORA_STAKE_MANAGER`, `AURORA_VALIDATION_MODULE`, `AURORA_IDENTITY_REGISTRY`, `AURORA_SYSTEM_PAUSE`.
2. Export signer keys for each actor (employer, worker, validators). If you omit dedicated keys, the script falls back to the defaults provided in `env.example`.
3. (Optional) Set `SAFE_ADDRESS` to point governance scripts at your multisig Safe before running owner tooling.

## What to expect

* `JobCreated`, `ResultSubmitted`, `ValidationCommit`, `ValidationReveal`, `JobCompleted`
* Stake balances + payouts recorded as JSON receipts
* `owner:verify-control` diff = clean
* Report files under `reports/<net>/aurora/`

## Governance control & parameter management

* Confirm governance wiring: `npm run owner:verify-control -- --network <network>` and `npm run owner:pulse -- --network <network>` should report your Safe/SystemPause addresses.
* Pause rehearsal: `npx hardhat run scripts/v2/pauseTest.ts --network <network>` (dry-run) demonstrates that the contract owner can halt/resume modules; append `--execute` after reviewing the plan in production.
* Thermostat tuning: `npx hardhat run scripts/v2/updateThermodynamics.ts --network <network>` prints diffs; run again with `--execute` to push new parameters after validation.
* Distribute an updated validator pool/quorum: rerun the demo or call `aurora.demo.ts` with new validator keys to ensure the owner can rotate participants without redeploying.
