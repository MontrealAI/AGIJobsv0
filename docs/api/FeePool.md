# FeePool API

Holds platform fees and distributes rewards.

## Functions

- `depositFee(uint256 amount)` – StakeManager deposits collected fees.
- `contribute(uint256 amount)` – anyone can add to the reward pool.
- `distributeFees()` – move accumulated fees to the reward pool and burn portion.
- `claimRewards()` – stakers claim their share of rewards.
- `governanceWithdraw(address to, uint256 amount)` – governance timelock emergency withdrawal.
- `setStakeManager(address manager)` – owner wires modules.
- `setRewardRole(uint8 role)` – choose which stakers earn rewards.
- `setBurnPct(uint256 pct)` / `setTreasury(address treasury)` – configure fee splits. Passing a non-zero treasury in the constructor auto-allowlists and sets it; otherwise treasury defaults to `address(0)` and later updates require `setTreasuryAllowlist`.
- `setTreasuryAllowlist(address treasury, bool allowed)` – manage the governance-approved treasury list.
- `setGovernance(address governance)` – set timelock enabled for withdrawals.

## Events

- `FeeDeposited(address from, uint256 amount)`
- `FeesDistributed(uint256 amount)`
- `FeesBurned(address caller, uint256 amount)`
- `RewardsClaimed(address user, uint256 amount)`
- `StakeManagerUpdated(address stakeManager)`
- `RewardRoleUpdated(uint8 role)`
- `BurnPctUpdated(uint256 pct)`
- `TreasuryUpdated(address treasury)`
- `TreasuryAllowlistUpdated(address treasury, bool allowed)`
- `GovernanceUpdated(address governance)`
- `GovernanceWithdrawal(address to, uint256 amount)`
- `RewardPoolContribution(address contributor, uint256 amount)`
