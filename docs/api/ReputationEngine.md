# ReputationEngine v3 candidate API

Tracks agent and validator reputation. This unreleased terminal-accounting candidate reports `version() == 3` and `terminalPolicyId() == keccak256("AGIJobs:terminal-reputation-v3")`. See [the policy and migration gates](../production/terminal-reputation-v3.md). Existing deployed v2 contracts retain their own API and economics.

## Owner configuration and administration

- `setCaller(address,bool)` authorizes administrative score callers.
- `setJobRegistry(address,bool)` separately authorizes capability-compatible registries. Deployment must perform this before opening jobs.
- `setFailurePenaltyPolicy(uint256,uint256)` sets basis points (0–10000) and maximum points (0–88888), for future job snapshots. Candidate defaults are 1000bps and 10 points.
- `setValidationRewardPercentage(uint256)` sets 0–100 percent for future job snapshots; default 8.
- `setStakeManager(address)`, `setScoringWeights(uint256,uint256)`, `setPremiumThreshold(uint256)` and `setBlacklist(address,bool)` retain their administrative roles.
- Authorized `add(address,uint256)`, `subtract(address,uint256)` and `update(address,int256)` remain explicit administrative operations. Negative administrative updates can increase entropy and trigger existing blacklist behavior.
- `onApply(address)` checks current admission. Default premium threshold is zero.

## Job lifecycle

Only an explicitly authorized registry can call `registerJob(uint256)`, `assignJob(uint256,address)`, `submitJob(uint256)` and `finalizeJob(uint256,address,bool,bool,uint256)`. The record is bound to registry plus job ID, and assignment binds the agent. Creation snapshots policy; assignment snapshots the maximum debit. Finalization returns actual credited points and is exact-once. Payout is the actual 18-decimal token amount; elapsed time earns no points.

The registry's current capability-compatible validation module calls `recordRound(address,uint256,uint256,address[],bool[],bool[],bool)`. Immutable per-index facts preserve the actual completed committee. A pending reveal window must finish unless every selected validator has revealed.

Anyone may call `accountValidator(address registry,uint256 jobId,uint256 index)` after terminal settlement. Each immutable index is accounted once. Agent payout does not wait for claims. There is no claim expiry. Claims can be inspected with `validatorFact`, `validatorAccounted` and `jobAccounting`.

Legacy unkeyed `onFinalize`, `rewardValidator` and `updateScores` revert with `LegacyReputationLifecycleUnsupported`. They must not be used as v3 adapters.

## Read methods and events

`reputationOf`, `getReputation`, `reputation`, `isBlacklisted`, `premiumThreshold`, `calculateReputationPoints` and `calculateValidatorReputationPoints` expose score and policy data. The payout curve can return zero for small jobs; see the policy's explicit examples and rounding rules.

Existing administrative events remain. Terminal events include `JobRegistryAuthorizationUpdated`, `FailurePenaltyPolicyUpdated`, `JobPolicySnapshotted`, `AssignmentScoreSnapshotted`, `SubmissionTimeRecorded`, `RoundFactsRecorded`, `JobReputationFinalized` and `ValidatorReputationAccounted`. `ReputationUpdated` reports the actual applied delta, including zero after rounding or saturation.

The legacy routing score API retains its existing units and weighting semantics. This candidate does not normalize token stake and reputation units or claim that their weighting is economically calibrated.
