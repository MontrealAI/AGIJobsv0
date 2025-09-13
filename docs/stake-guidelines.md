# Stake Adjustment Guidelines

This policy outlines how governance should evaluate staking parameters
and when to update them.

## Metrics

The `scripts/stake-adjuster.ts` utility reads on‑chain data and reports:

- **Active agents** – unique addresses that deposited stake as agents
  in the recent block window.
- **Average job reward** – mean of the `JobFunded` rewards over the
  same window.

Run the tool with

```bash
npx ts-node --compiler-options '{"module":"commonjs"}' scripts/stake-adjuster.ts --stake-manager <address> --job-registry <address>
```

## Recommendations

The script suggests new limits using recent rewards:

- `minStake` ≈ 10% of the average job reward
- `maxStakePerAddress` ≈ 10 × the average job reward

To immediately apply the recommendation, provide a governance key and
pass `--apply`:

```bash
PRIVATE_KEY=0xabc... npx ts-node --compiler-options '{"module":"commonjs"}' scripts/stake-adjuster.ts --stake-manager <address> --job-registry <address> --apply
```

This invokes `StakeManager.setMinStake` and
`StakeManager.setMaxStakePerAddress` with the calculated values.

## Schedule

Review these metrics monthly. If the active‑agent count or average
reward shifts by more than 20% since the last review, update the staking
limits using the script. Regular adjustments keep staking requirements
aligned with market conditions.
