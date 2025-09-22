# Job Registry Configuration Guide

This guide walks governance operators and support staff through updating the
`JobRegistry` contract with the canonical configuration committed to this
repository. The `scripts/v2/updateJobRegistry.ts` helper reads
`config/job-registry.json`, compares it to on-chain values and either prints the
required governance calls (dry run) or submits transactions directly when
executed from the authorised timelock/multisig.

The script is intentionally conservative:

- It validates numeric ranges so the governance transaction cannot revert due to
  malformed input.
- It blocks execution when the connected signer is not the Job Registry owner to
  prevent accidental submissions with an unauthorised account.
- Dry runs provide the fully-encoded calldata for each call so the operations
  team can copy/paste into a multisig or timelock queue if desired.

> **Tip:** keep the configuration file in version control. Every dry run prints
> the file path that was used so you can review change history as part of your
> deployment checklist.

## 1. Edit `config/job-registry.json`

Field names ending in `Tokens` are interpreted using the `$AGIALPHA` decimals
(18 by default). For example, a value of `"1.5"` becomes
`1.5 × 10¹⁸ = 1500000000000000000` on-chain.

| Field                          | Description                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `jobStakeTokens`               | Stake required (in tokens) for every new job. Stored as a `uint96`.                                                  |
| `minAgentStakeTokens`          | Global minimum agent stake required before applying. Stored as a `uint96`.                                           |
| `maxJobRewardTokens`           | Maximum per-job reward in tokens. Set to `0` to disable the cap.                                                     |
| `jobDurationLimitSeconds`      | Hard deadline window for new jobs (0 disables the check).                                                            |
| `maxActiveJobsPerAgent`        | Cap on simultaneous assignments per agent (0 disables the check).                                                    |
| `expirationGracePeriodSeconds` | Additional grace period after a deadline before a job can expire.                                                    |
| `feePct`                       | Protocol fee percentage (0–100).                                                                                     |
| `validatorRewardPct`           | Share of the job reward paid to validators (0–100). The sum of `feePct` and `validatorRewardPct` may not exceed 100. |
| `treasury`                     | Destination for forfeited funds when employers or agents are blacklisted. Use `"0x000...000"` to burn them.          |
| `taxPolicy`                    | Optional override of the active `TaxPolicy` contract. Leave as `0x0` to skip updates.                                |
| `acknowledgers`                | Mapping of addresses to booleans controlling who can call `acknowledgeFor`. Addresses not listed are left untouched. |

## 2. Dry run the update

```bash
npx hardhat run scripts/v2/updateJobRegistry.ts --network <network>
```

The command prints the signer, the configuration file in use and a numbered list
of planned actions. Each action includes the function, arguments and calldata so
you can stage transactions manually if required.

If the signer is not the Job Registry owner the script automatically stays in
dry-run mode and prints a warning.

## 3. Execute the transactions (optional)

Once you are satisfied with the dry run output, execute the updates directly by
connecting the authorised governance signer and passing `--execute`:

```bash
npx hardhat run scripts/v2/updateJobRegistry.ts --network <network> --execute
```

The helper submits one transaction per action, waits for confirmation and stops
immediately if any transaction fails. Keep the console output for governance
records.

## 4. Using alternate configuration files

To preview or apply settings from another JSON file, supply `--config`:

```bash
npx hardhat run scripts/v2/updateJobRegistry.ts --network <network> \
  --config ./deployment-config/mainnet-job-registry.json
```

This allows per-environment overrides while keeping the default configuration in
`config/job-registry.json`.

## 5. Troubleshooting

- **`feePct + validatorRewardPct cannot exceed 100`** – adjust the values so the
  combined percentage is at most 100.
- **`Signer ... is not the governance owner ...`** – the connected account lacks
  permission to execute the changes. Switch to the timelock/multisig or run in
  dry-run mode without `--execute`.
- **`Job registry address is not configured`** – populate
  `config/agialpha.json` → `modules.jobRegistry` or pass `--registry <address>`.

For a detailed description of every Job Registry function see the API reference
in `docs/api-reference.md`.
