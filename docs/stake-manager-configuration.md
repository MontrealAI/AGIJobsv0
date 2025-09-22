# StakeManager Configuration Guide

This guide enables governance operators to align the on-chain `StakeManager`
parameters with the canonical configuration tracked in this repository. The
`scripts/v2/updateStakeManager.ts` helper reads `config/stake-manager.json`,
compares every supported field to live contract state and prints the required
governance calls. When run with `--execute` the script submits those
transactions directly from the authorised timelock or multisig owner.

The helper is defensive by design:

- It validates all numeric ranges so transactions cannot revert because of
  malformed input (e.g., fee percentages summing above 100%).
- It refuses to submit transactions if the connected signer is not the
  StakeManager owner, falling back to a dry run with a warning.
- Dry runs emit method names, arguments and ABI-encoded calldata for every
  action so teams can queue transactions in an external multisig or timelock
  if desired.

> **Tip:** keep `config/stake-manager.json` under version control. Each dry run
> prints the path in use so reviewers can audit the change history before
> dispatching governance transactions.

## 1. Edit `config/stake-manager.json`

Fields ending in `Tokens` are interpreted using the `$AGIALPHA` decimals (18 by
default). For instance, `"1.5"` becomes `1.5 × 10¹⁸ = 1500000000000000000`
base units on-chain.

| Field                                                                 | Description                                                                                                                                                                                   |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `minStakeTokens`                                                      | Minimum stake required for any participant. Must be greater than zero.                                                                                                                        |
| `maxStakePerAddressTokens`                                            | Optional cap on the combined stake an address can hold. Use `"0"` to disable the limit.                                                                                                       |
| `feePct`                                                              | Protocol fee percentage deducted from every reward (0–100).                                                                                                                                   |
| `burnPct`                                                             | Percentage of rewards burned during payout (0–100).                                                                                                                                           |
| `validatorRewardPct`                                                  | Portion of rewards routed to validators (0–100). The sum of the three percentages above may not exceed 100.                                                                                   |
| `employerSlashPct`                                                    | Share of a slashed stake returned to the employer (0–100).                                                                                                                                    |
| `treasurySlashPct`                                                    | Share of a slashed stake sent to the treasury (0–100). `employerSlashPct + treasurySlashPct ≤ 100`.                                                                                           |
| `treasury`                                                            | Destination for slashed treasury funds. Use the zero address to burn them; cannot equal the owner address.                                                                                    |
| `treasuryAllowlist`                                                   | Mapping of addresses to booleans controlling who may receive treasury payouts. Unlisted addresses remain unchanged.                                                                           |
| `unbondingPeriodSeconds`                                              | Length of the withdrawal cooldown window. Must be greater than zero.                                                                                                                          |
| `stakeRecommendations.minTokens` / `maxTokens`                        | Optional helper that calls `setStakeRecommendations` to update both the recommended minimum and maximum stake in one transaction. `maxTokens` may be `"0"` to disable the recommendation cap. |
| `autoStake.enabled`                                                   | Enables or disables automatic stake tuning driven by disputes and thermodynamic metrics.                                                                                                      |
| `autoStake.threshold`                                                 | Dispute count required before increasing the minimum stake.                                                                                                                                   |
| `autoStake.increasePct` / `decreasePct`                               | Percent increments/decrements applied by the tuning algorithm (0–100).                                                                                                                        |
| `autoStake.windowSeconds`                                             | Observation window for dispute counts.                                                                                                                                                        |
| `autoStake.floorTokens`                                               | Minimum value the automatically tuned `minStake` can reach. Provide `"0"` to keep the current floor.                                                                                          |
| `autoStake.ceilingTokens`                                             | Optional ceiling for the tuned `minStake`. Set to `"0"` to disable the cap.                                                                                                                   |
| `autoStake.temperatureThreshold` / `hamiltonianThreshold`             | Signed thresholds for incorporating Thermostat temperature and Hamiltonian feed readings.                                                                                                     |
| `autoStake.disputeWeight` / `temperatureWeight` / `hamiltonianWeight` | Weights applied to each signal when computing the tuning score.                                                                                                                               |
| `pauser`                                                              | Optional address allowed to pause/unpause alongside governance. Use the zero address to remove the delegate.                                                                                  |
| `jobRegistry`                                                         | Job Registry address (must expose `version() == 2`). Leave as `0x0` to skip updates.                                                                                                          |
| `disputeModule`                                                       | Dispute Module address (`version() == 2`). Leave `0x0` to skip.                                                                                                                               |
| `validationModule`                                                    | Validation Module address (`version() == 2`). Leave `0x0` to skip.                                                                                                                            |
| `feePool`                                                             | FeePool address (`version() == 2`). Leave `0x0` to skip.                                                                                                                                      |
| `thermostat` / `hamiltonianFeed`                                      | Optional telemetry feeds for automatic stake tuning.                                                                                                                                          |
| `maxAGITypes`                                                         | Maximum number of AGI type NFT entries the StakeManager accepts (1–50). Must be at least the current on-chain count.                                                                          |
| `maxTotalPayoutPct`                                                   | Upper bound on AGI type multipliers (100–200).                                                                                                                                                |

## 2. Dry run the update

```bash
npx hardhat run scripts/v2/updateStakeManager.ts --network <network>
```

The command prints the signer, the configuration file used and a numbered list
of planned actions. Each action includes the method, arguments and calldata so
you can stage transactions manually if desired.

If the connected account is not the StakeManager owner the script automatically
stays in dry-run mode and emits a warning.

## 3. Execute the transactions (optional)

Once you are satisfied with the dry run output, execute the changes by
connecting the authorised governance signer and adding `--execute`:

```bash
npx hardhat run scripts/v2/updateStakeManager.ts --network <network> --execute
```

The script submits one transaction per action, waits for confirmation and stops
immediately if any transaction fails. Preserve the console output for your
operations log.

## 4. Use alternate configuration files

To preview or apply parameters from another JSON file, supply `--config`:

```bash
npx hardhat run scripts/v2/updateStakeManager.ts --network <network> \
  --config ./deployment-config/mainnet-stake-manager.json
```

This workflow supports per-environment overrides while keeping the default
settings in `config/stake-manager.json`.

## 5. Troubleshooting

- **`feePct + burnPct + validatorRewardPct cannot exceed 100`** – adjust the
  percentages so their sum stays within 100.
- **`Signer ... is not the governance owner ...`** – connect the timelock or
  multisig that owns the StakeManager before using `--execute`, or rerun without
  `--execute` for a dry run.
- **`Stake manager address is not configured`** – populate
  `config/agialpha.json → modules.stakeManager` or pass `--stake-manager
  <address>`.
- **`maxAGITypes cannot be below the current AGI type count`** – remove AGI type
  entries on-chain before tightening the limit.

For detailed descriptions of every StakeManager function refer to the API
reference in `docs/api/StakeManager.md`.
