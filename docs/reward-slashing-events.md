# Reward and Slashing Events

This document describes the `RewardBudget` and `SlashingStats` events emitted by the protocol.

## RewardBudget

Emitted by `RewardEngineMB` when settling an epoch.

```
event RewardBudget(
    uint256 indexed epoch,
    uint256 minted,
    uint256 burned,
    uint256 redistributed,
    uint256 distributionRatio
);
```

- `epoch`: Identifier supplied to `settleEpoch`.
- `minted`: Total tokens minted for rewards during the epoch.
- `burned`: Tokens destroyed. The current implementation does not burn within the reward engine and this value is `0`.
- `redistributed`: Sum of tokens paid out to participants.
- `distributionRatio`: `redistributed / minted` scaled by `1e18`.

## SlashingStats

Emitted by `StakeManager` whenever stake is slashed.

```
event SlashingStats(
    uint256 timestamp,
    uint256 minted,
    uint256 burned,
    uint256 redistributed,
    uint256 burnRatio
);
```

- `timestamp`: Block timestamp when the slash occurred.
- `minted`: New tokens created by the slash (always `0`).
- `burned`: Amount of stake sent to the burn address.
- `redistributed`: Stake redistributed to employers or the treasury.
- `burnRatio`: `burned / redistributed` scaled by `1e18`.

These events enable off-chain monitors to track minting and burning activity per epoch and alert on divergence.

## CLI Aggregation

The repository provides `scripts/aggregate-events.ts`, a simple CLI that aggregates
`RewardBudget` and `SlashingStats` events over a block range and prints total
minted, burned, redistributed amounts and ratios. Set `RPC_URL`, contract
addresses (`REWARD_ENGINE`, `STAKE_MANAGER`) and optional `START_BLOCK`/`END_BLOCK`
environment variables before running:

```
RPC_URL=http://localhost:8545 \
REWARD_ENGINE=0x... \
STAKE_MANAGER=0x... \
npx ts-node scripts/aggregate-events.ts
```
