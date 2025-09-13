# StakeManager API

Handles staking, escrow and slashing of the $AGIALPHA token. NFT ownership boosts payouts by applying the highest approved multiplier; extra amounts are funded from protocol fees or reduced burns.

## Functions

- `setMinStake(uint256 minStake)` / `setMaxStakePerAddress(uint256 maxStake)` – configure stake limits.
- `setTreasury(address treasury)` / `setFeePool(address feePool)` – wire fee destinations. Treasury must be the zero address (burn) or an address pre-approved via `setTreasuryAllowlist` and not the governance owner.
- `setTreasuryAllowlist(address treasury, bool allowed)` – manage the governance-approved treasury list.
- `setJobRegistry(address registry)` / `setDisputeModule(address module)` / `setValidationModule(address module)` – connect modules. Staking reverts until a registry is configured.
- `depositStake(uint8 role, uint256 amount)` – user stakes as agent (`0`) or validator (`1`).
- `withdrawStake(uint8 role, uint256 amount)` – withdraw previously staked tokens.
- `lock(address from, uint256 amount)` / `release(address to, uint256 amount)` – JobRegistry hooks for job rewards.
- `lockDisputeFee(address payer, uint256 amount)` / `payDisputeFee(address to, uint256 amount)` – escrow dispute fees.
- `slash(address user, uint8 role, uint256 amount, address employer)` – JobRegistry slashes the user's stake for a given role and routes the employer share.
- `slash(address user, uint256 amount, address recipient)` – DisputeModule slashes validator stake during disputes and sends the slashed amount to `recipient`.
- `setMaxAGITypes(uint256 newMax)` – cap the number of AGI type entries.
- `setMaxTotalPayoutPct(uint256 newMax)` – cap the total payout percentage across AGI types.
- `addAGIType(address nft, uint256 payoutPct)` – register or update a payout multiplier for holders of `nft`. Only the highest multiplier applies. Each entry is capped at `MAX_PAYOUT_PCT` (200%) and totals are further limited by `maxTotalPayoutPct`.
- `removeAGIType(address nft)` – delete a previously registered AGI type.
- `syncBoostedStake(address user, uint8 role)` – recalculate a user's boosted stake after NFT changes. `FeePool.claimRewards` calls this automatically for the reward role.
- `autoTuneStakes(bool enabled)` – toggles automatic adjustment of `minStake` based on recent dispute activity.
- `configureAutoStake(uint256 threshold, uint256 upPct, uint256 downPct, uint256 window, uint256 floor, uint256 ceil)` – configures dispute thresholds and bounds for automatic stake tuning.
- `recordDispute()` / `checkpointStake()` – DisputeModule calls `recordDispute` whenever a dispute is raised; anyone may call `checkpointStake` to evaluate adjustments when no disputes occurred.
- `stakeOf(address user, uint8 role)` / `totalStake(uint8 role)` / `totalBoostedStake(uint8 role)` / `getTotalPayoutPct(address user)` – view functions. `getTotalPayoutPct` returns the highest `payoutPct` among held NFTs (or `100` when none) capped by `maxTotalPayoutPct`.

## Events

- `StakeDeposited(address indexed user, Role indexed role, uint256 amount)`
- `StakeWithdrawn(address indexed user, Role indexed role, uint256 amount)`
- `StakeSlashed(address indexed user, Role role, address indexed employer, address indexed treasury, uint256 employerShare, uint256 treasuryShare, uint256 burnShare)`
- `StakeEscrowLocked(bytes32 indexed jobId, address indexed from, uint256 amount)`
- `StakeReleased(bytes32 indexed jobId, address indexed to, uint256 amount)`
- `RewardPaid(bytes32 indexed jobId, address indexed to, uint256 amount)`
- `TokensBurned(bytes32 indexed jobId, uint256 amount)`
- `DisputeFeeLocked(address indexed payer, uint256 amount)`
- `DisputeFeePaid(address indexed to, uint256 amount)`
- `FeePctUpdated(uint256 pct)` / `BurnPctUpdated(uint256 pct)` / `ValidatorRewardPctUpdated(uint256 pct)`
- `ModulesUpdated(address indexed jobRegistry, address indexed disputeModule)`
- `MaxAGITypesUpdated(uint256 oldMax, uint256 newMax)`
- `MaxTotalPayoutPctUpdated(uint256 oldMax, uint256 newMax)`
- `AGITypeUpdated(address indexed nft, uint256 payoutPct)`
- `AGITypeRemoved(address indexed nft)`
- `AutoStakeTuningEnabled(bool enabled)` / `AutoStakeConfigUpdated(uint256 threshold, uint256 upPct, uint256 downPct, uint256 window, uint256 floor, uint256 ceil)`
