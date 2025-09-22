# FeePool configuration guide

The `FeePool` contract routes protocol fees, burns a configurable share and
streams the remainder to the staker role of your choice. The
`scripts/v2/updateFeePool.ts` helper keeps every owner-controlled parameter in
sync with `config/fee-pool.json` so the contract owner can retune the module
without touching Etherscan.

## What the helper manages

The script inspects the on-chain contract and schedules transactions whenever
the committed configuration differs. It covers the following settings:

| Setting              | Config key          | Notes                                                                          |
| -------------------- | ------------------- | ------------------------------------------------------------------------------ |
| StakeManager address | `stakeManager`      | Must report `version() == 2`.                                                  |
| Reward role          | `rewardRole`        | Accepts `agent`, `validator`, `platform` or the numeric enum (`0-2`).          |
| Burn percentage      | `burnPct`           | Integer between `0` and `100`.                                                 |
| Treasury address     | `treasury`          | `0x0` burns rounding dust; non-zero targets must be allowlisted.               |
| Treasury allowlist   | `treasuryAllowlist` | Maps addresses to `true/false`. Automatically updated before treasury changes. |
| Governance timelock  | `governance`        | Address authorised to call `governanceWithdraw`.                               |
| Pauser               | `pauser`            | Optional emergency pauser.                                                     |
| Tax policy           | `taxPolicy`         | Must implement `isTaxExempt() == true`.                                        |
| Rewarder allowlist   | `rewarders`         | Addresses permitted to call `setRewarder`.                                     |

All addresses default to `0x000...000` in `config/fee-pool.json` and should be
updated before running the script against a live deployment.

## Editing `config/fee-pool.json`

```json
{
  "stakeManager": "0x1234...",
  "rewardRole": "platform",
  "burnPct": 5,
  "treasury": "0xabcd...",
  "treasuryAllowlist": {
    "0xabcd...": true
  },
  "governance": "0xfeed...",
  "pauser": "0xdead...",
  "taxPolicy": "0xbeef...",
  "rewarders": {
    "0xcafe...": true
  }
}
```

- Use checksum addresses; the config loader normalises and validates them.
- Leave optional entries out (or set to `0x0`) when you do not wish to change
  the on-chain value.
- Treasury addresses must be present in the allowlist (set to `true`) before
  they can be selected. The helper automatically adds an allowlist transaction
  when the target is missing but not explicitly disabled.

## Running the updater

1. Ensure the Hardhat network matches your deployment (e.g. `--network
mainnet`).
2. Dry-run the script:

   ```bash
   npx hardhat run scripts/v2/updateFeePool.ts --network <network>
   ```

   The helper prints every planned call, current and desired values plus raw
   calldata for multisig review.

3. Once the plan looks correct, append `--execute` to submit the transactions
   from the contract owner account:

   ```bash
   npx hardhat run scripts/v2/updateFeePool.ts --network <network> --execute
   ```

   Transactions are sent sequentially and the script halts on any failure.

## Safety checks and guardrails

- Rejects zero-address FeePool targets and confirms the contract reports
  `version() == 2` before proceeding.
- Verifies the caller is the `owner()` when `--execute` is provided; otherwise
  the run remains a dry run.
- Cross-checks the configured StakeManager’s `version()` and aborts if the
  target is incompatible.
- Calls `isTaxExempt()` on the configured tax policy before queueing the
  update.
- Prevents setting the treasury to the owner address and warns when the zero
  address would burn residual dust.
- Auto-enables treasury allowlist entries when they are missing (unless
  explicitly set to `false`).

These validations keep the FeePool immediately production-ready while granting
the owner full control from a single configuration file.
