# v1 to v2 Function Map

The table below maps common public functions from the monolithic `AGIJobManagerV1` contract to their equivalents in the modular v2 suite. Functions that were removed or split across modules are noted.

| v1 function                                      | v2 module                  | v2 function / note                    |
| ------------------------------------------------ | -------------------------- | ------------------------------------- |
| `createJob`                                      | `JobRegistry`              | `createJob`                           |
| `applyForJob`                                    | `JobRegistry`              | `applyForJob`                         |
| `requestJobCompletion`                           | `JobRegistry`              | `submit`                              |
| `commitValidation`                               | `ValidationModule`         | `commitValidation`                    |
| `revealValidation`                               | `ValidationModule`         | `revealValidation`                    |
| `validateJob`                                    | `ValidationModule`         | `revealValidation(approve=true)`      |
| `disapproveJob`                                  | `ValidationModule`         | `revealValidation(approve=false)`     |
| `disputeJob`                                     | `JobRegistry`              | `raiseDispute`                        |
| `resolveDispute`                                 | `DisputeModule`            | `resolve`                             |
| `resolveStalledJob`                              | `JobRegistry`              | `finalize`                            |
| `cancelJob` / `cancelExpiredJob`                 | `JobRegistry`              | `cancelJob`                           |
| `stake`                                          | `StakeManager`             | `depositStake(role)`                  |
| `withdrawStake`                                  | `StakeManager`             | `withdrawStake(role)`                 |
| `stakeAgent`                                     | `StakeManager`             | `depositStake(Role.Agent)`            |
| `withdrawAgentStake`                             | `StakeManager`             | `withdrawStake(Role.Agent)`           |
| `contributeToRewardPool`                         | `FeePool`                  | `contribute`                          |
| `listNFT`                                        | `CertificateNFT`           | `list`                                |
| `purchaseNFT`                                    | `CertificateNFT`           | `purchase`                            |
| `delistNFT`                                      | `CertificateNFT`           | `delist`                              |
| `updateAGITokenAddress`                          | `StakeManager` / `FeePool` | removed – token address is immutable  |
| `blacklistAgent` / `clearAgentBlacklist`         | `ReputationEngine`         | `blacklist(user, status)`             |
| `blacklistValidator` / `clearValidatorBlacklist` | `ReputationEngine`         | `blacklist(user, status)`             |
| `addModerator` / `removeModerator`               | `DisputeModule`            | `addModerator` / `removeModerator`    |
| `setPremiumReputationThreshold`                  | `ReputationEngine`         | `setThreshold`                        |
| `setMaxJobPayout`                                | `JobRegistry`              | `setMaxJobReward`                     |
| `setJobDurationLimit`                            | `JobRegistry`              | `setJobDurationLimit`                 |
| `setClubRootNode`                                | `ENSOwnershipVerifier`     | `setClubRootNode`                     |
| `setAgentRootNode`                               | `JobRegistry`              | `setAgentRootNode`                    |
| `setValidatorMerkleRoot`                         | `ENSOwnershipVerifier`     | `setValidatorMerkleRoot`              |
| `setAgentMerkleRoot`                             | `JobRegistry`              | `setAgentMerkleRoot`                  |
| `setENS`                                         | `ENSOwnershipVerifier`     | `setENS`                              |
| `setNameWrapper`                                 | `ENSOwnershipVerifier`     | `setNameWrapper`                      |
| `setStakeRequirement`                            | `StakeManager`             | `setMinStake`                         |
| `setAgentStakeRequirement`                       | `JobRegistry`              | `setJobStake`                         |
| `pause` / `unpause`                              | –                          | removed in v2                         |
| `acceptTerms`                                    | `JobRegistry`              | `acknowledgeTaxPolicy`                |
| `setBaseURI`                                     | `CertificateNFT`           | `setBaseURI`                          |
| `setValidationRewardPercentage`                  | `JobRegistry`              | `setValidatorRewardPct`               |
| `setBurnPercentage` / `setBurnAddress`           | `FeePool`                  | `setBurnPct` / `setTreasury`          |
| `setValidatorsPerJob`                            | `ValidationModule`         | `setValidatorBounds`                  |
| `setCommitDuration` / `setRevealDuration`        | `ValidationModule`         | `setCommitWindow` / `setRevealWindow` |

This list focuses on externally callable functions. Internal helpers and purely informational getters in v1 are omitted or replaced by public state variables in v2.

## Event name mapping

To aid log filtering during migration, v2 now emits clearer lifecycle names while keeping the v1 aliases for backwards compatibility.

| v1 event       | v2 canonical event                       |
| -------------- | ---------------------------------------- |
| `JobCreated`   | `JobCreated`                             |
| `JobApplied`   | `AgentAssigned` (`JobApplied` alias)     |
| `JobSubmitted` | `ResultSubmitted` (`JobSubmitted` alias) |
| `JobCompleted` | `JobCompleted`                           |
| `JobFinalized` | `JobFinalized`                           |
