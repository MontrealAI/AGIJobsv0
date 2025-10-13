# AURORA Runbook (Operators)

> Assumes `.env` configured (RPC_URL, PRIVATE_KEY / SAFE settings if needed).

## Local (Anvil)

```bash
npm run demo:aurora:local
```

This:

boots anvil,

deploys v2 defaults (scripts/v2/deployDefaults.ts),

runs the end-to-end flow with quickstart helpers,

(optional) dry-runs a thermostat update (scripts/v2/updateThermodynamics.ts),

captures receipts + owner snapshots, and

writes aurora-report.md.

Target network
# set RPC_URL, CHAIN_ID, and signer  
npm run demo:aurora:sepolia

What to expect

JobCreated, JobSubmitted, ValidationCommitted/Reveal, JobFinalized

Stake balances + payouts

owner:verify-control diff = clean

Report files under reports/<net>/aurora/
