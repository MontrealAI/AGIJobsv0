# ReputationEngine API

Tracks reputation scores for agents and validators.

## Functions

- `setCaller(address caller, bool allowed)` – owner designates authorized modules.
- `setStakeManager(address manager)` – wire stake manager.
- `setScoringWeights(uint256 stakeWeight, uint256 reputationWeight)` – configure weighting.
- `setValidationRewardPercentage(uint256 percentage)` – portion of rewards for validators.
- `setPremiumThreshold(uint256 threshold)` – reputation required for premium access.
- `setBlacklist(address user, bool status)` – owner blacklist or unblacklist an address.
- `add(address user, uint256 amount)` / `subtract(address user, uint256 amount)` – adjust scores.
- `onApply(address user)` / `onFinalize(address user, bool success, uint256 payout, uint256 duration)` – hooks from JobRegistry.
- `rewardValidator(address validator, uint256 agentGain)` – award reputation to validator.
- `getReputation(address user)` – view current score.

## Events

- `ReputationUpdated(address user, int256 delta, uint256 newScore)`
- `BlacklistUpdated(address user, bool status)`
- `CallerUpdated(address caller, bool allowed)`
- `PremiumThresholdUpdated(uint256 newThreshold)`
- `StakeManagerUpdated(address stakeManager)`
- `ScoringWeightsUpdated(uint256 stakeWeight, uint256 reputationWeight)`
- `ValidationRewardPercentageUpdated(uint256 percentage)`
