# ReputationEngine API

Tracks reputation scores for agents and validators.

## Positive credit and penalties

New source builds apply diminishing returns to **new points only**. Previously
earned reputation is preserved by successful work and other positive credits.
With `M = 88,888`, `S = 10^18`, current score `c`, and incoming points `p`:

1. Bound the incoming award to `b = min(p, M)` before multiplication.
2. Calculate `factor = S + floor((c + b)^2 * S / M^2)`.
3. Add `floor(b * S / factor)` to `c`, saturating the score at `M`.

A score already at the cap remains capped. Integer rounding can produce zero
credit, including a one-point award, but never a negative credit. The first
20,000-point award still produces 19,036; a later successful 34-point award adds
32, producing 19,068. Larger existing scores damp new credits more strongly.
Explicit negative updates, subtraction, failed-work penalties, blacklist and
rehabilitation rules retain their existing behavior. Payout inputs use
18-decimal token base units.

Historical prebuilt demo artifacts retain their original bytes and the old
growth defect. They are not repaired by updating source and must not be used as
the corrected deployment candidate. See
[the correction record](../production/reputation-growth-correction-2026-10-15.md)
for evidence and remaining deployment gates.

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
