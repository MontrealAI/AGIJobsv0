# AURORA Runbook (Operators)

> Assumes `.env` configured (RPC_URL, PRIVATE_KEY / SAFE settings if needed).

## Local (Anvil)

```bash
npm run demo:aurora:local
```

This:

1. Boots `anvil`.
2. Deploys v2 defaults (`scripts/v2/deployDefaults.ts`) with verification disabled for speed and writes a deployment summary.
3. Mints mock `$AGIALPHA` (or reports exact top-up requirements if minting is disabled), configures validator bounds, and runs the full job lifecycle end‑to‑end.
4. Captures funding/governance receipts + owner snapshots, and
5. Writes `aurora-report.md` summarising the mission.

## Target network

```bash
# set RPC_URL, CHAIN_ID, signer keys and module addresses
# optionally set AURORA_SKIP_MINT=1 when using pre-funded accounts
npm run demo:aurora:sepolia
```

## What to expect

* `JobCreated`, `ResultSubmitted`, `ValidationCommit`, `ValidationReveal`, `JobCompleted`
* Stake balances + payouts recorded as JSON receipts
* `owner:verify-control` diff = clean
* Report files under `reports/<net>/aurora/`
* `funding.json` identifies any accounts lacking balances when running against funded networks
