# Owner Console Quick Actions

These actions assume ownership has been transferred to the designated multisig or council account and that `SystemPause` has been wired via `scripts/v2/updateSystemPause.ts`.

## Pause / Resume

```bash
npx hardhat --network <network> system-pause:pause-all
npx hardhat --network <network> system-pause:unpause-all
```

Both tasks confirm the pause status across every registered module and emit a summary table. During a pause the `/onebox/simulate` step will refuse to execute, providing a user-facing proof that the kill switch is effective.

## Reward Tuning

Adjust role shares to emphasise validator compensation (example values only):

```bash
npx hardhat --network <network> system-pause:forward-call \
  --target RewardEngineMB \
  --method setRoleShares \
  --args '[{"role":"agent","shareBps":5500},{"role":"validator","shareBps":4500}]'
```

Temperature shift to increase emissions responsiveness:

```bash
npx hardhat --network <network> system-pause:forward-call \
  --target Thermostat \
  --method setTemperature \
  --args '["1.15e18"]'
```

## Governance Council Vote (optional)

If the `GlobalGovernanceCouncil` controls `SystemPause`, queue and execute a pre-authored emergency drill:

```bash
node demo/cosmic-omni-sovereign-symphony/bin/run-governance.js \
  --config demo/omni-orchestrator-singularity/config/council.example.json \
  --proposal emergency-drill.json \
  --network <network>
```

The example proposal pauses the platform, performs a thermodynamic parameter adjustment, unpauses, and records receipts to the governance journal.
