# Platform Registry Operations Guide

This guide walks governance operators through updating the `PlatformRegistry`
configuration using the automated tooling shipped with the repository. The
process is non-destructive and can be executed in dry-run mode to generate a
transaction plan before broadcasting any changes.

## Prerequisites

- Run `npm ci` to install dependencies.
- Compile the contracts with `npm run compile` so that the Hardhat artifacts are
  available for scripting.
- Ensure your local signer controls the on-chain `PlatformRegistry` owner (or a
  delegate approved by your multisig/timelock).
- Update [`config/platform-registry.json`](../config/platform-registry.json)
  with the desired target state. All addresses accept checksummed or
  lower‑cased inputs and are normalised automatically.

### Supported configuration fields

| Field                    | Description                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `address`                | Optional override for the deployed PlatformRegistry address. Falls back to `config/agialpha.json`. |
| `stakeManager`           | Target StakeManager address. The helper enforces a v2 module by querying the on-chain `version()`. |
| `reputationEngine`       | Target ReputationEngine address. Must expose `version() == 2`.                                     |
| `minPlatformStake`       | Minimum stake in 18-decimal base units.                                                            |
| `minPlatformStakeTokens` | Human-friendly minimum stake that is converted using the configured token decimals.                |
| `pauser`                 | Optional pauser wallet allowed to trigger `pause()/unpause()`.                                     |
| `registrars`             | Map of registrar addresses (`true` = authorised, `false` = revoked).                               |
| `blacklist`              | Map of operator addresses (`true` = blacklisted, `false` = cleared).                               |

> `minPlatformStake` and `minPlatformStakeTokens` are mutually compatible—the
> script prefers the raw base-unit value when both are supplied.

## Dry run

```bash
npx hardhat run scripts/v2/updatePlatformRegistry.ts --network <network>
```

- Reads `config/platform-registry.json` and the canonical token configuration.
- Generates the minimal call sequence needed to align on-chain state with the
  JSON file.
- Validates StakeManager and ReputationEngine candidates by checking their
  `version()` output.
- Prints calldata for each action, enabling review or manual submission.

If the connected signer is not the governance owner, the helper automatically
falls back to dry-run mode and warns that transactions were not broadcast.

## Execute updates

Once the plan looks correct, re-run with `--execute` while connected with the
owner key (or delegate such as a multisig module).

```bash
npx hardhat run scripts/v2/updatePlatformRegistry.ts --network <network> --execute
```

The helper stops immediately if any transaction fails or a module reports an
unexpected version. Every successful call is logged with its transaction hash.

## npm shortcut

For convenience, the package.json exposes:

```bash
npm run platform:registry:update -- --network <network> [--execute]
```

This wrapper simply forwards arguments to the Hardhat script and behaves
identically to the raw `npx hardhat run` invocation.

## Inspect on-chain state

Before executing changes, you can generate a high-signal snapshot of the
current PlatformRegistry configuration, active registrars and blacklist entries.

```bash
npm run platform:registry:inspect -- --network <network> [--json] \
  [--from-block <number>] [--to-block <number>] [--batch-size <number>]
```

- Collects registrar/blacklist history directly from `RegistrarUpdated` and
  `Blacklisted` events, highlighting any addresses missing from the JSON
  configuration file.
- Outputs a human-readable table by default and supports `--json` for pipelines
  or change-management tooling.
- Accepts optional block range arguments for RPC providers with limited log
  windows. By default the helper scans from block 0 to the latest block.

This inspection tool complements `updatePlatformRegistry.ts` by confirming the
live state before submitting governance transactions.

## Operational tips

- Keep `config/platform-registry.json` under version control so governance
  changes are auditable and reproducible.
- Pair the dry run output with the `owner:plan` report to consolidate all module
  updates into a single governance review.
- When revoking registrars or unblocking operators, explicitly set the desired
  boolean in the JSON file so the helper emits the corrective transaction.
