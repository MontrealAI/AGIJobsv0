# FeePool API

Holds platform fees and distributes rewards.

## Functions
- `depositFee(uint256 amount)` – StakeManager deposits collected fees.
- `contribute(uint256 amount)` – anyone can add to the reward pool.
- `distributeFees()` – move accumulated fees to the reward pool and burn portion.
- `claimRewards()` – stakers claim their share of rewards.
- `ownerWithdraw(address to, uint256 amount)` – owner emergency withdrawal.
- `setStakeManager(address manager)` – owner wires modules.
- `setRewardRole(uint8 role)` – choose which stakers earn rewards.
- `setBurnPct(uint256 pct)` / `setTreasury(address treasury)` – configure fee splits.

## Events
- `FeeDeposited(address from, uint256 amount)`
- `FeesDistributed(uint256 amount)`
- `Burned(uint256 amount)`
- `RewardsClaimed(address user, uint256 amount)`
- `StakeManagerUpdated(address stakeManager)`
- `RewardRoleUpdated(uint8 role)`
- `BurnPctUpdated(uint256 pct)`
- `TreasuryUpdated(address treasury)`
- `OwnerWithdrawal(address to, uint256 amount)`
- `RewardPoolContribution(address contributor, uint256 amount)`
