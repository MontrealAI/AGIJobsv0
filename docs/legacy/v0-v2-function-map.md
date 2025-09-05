> **Note:** Current deployments use an 18-decimal AGIALPHA token.

# v0 to v2 Function Map

The table below links common `AGIJobManager v0` functions to their
replacements in the modular v2 architecture. Only job lifecycle,
blacklist and NFT marketplace functions are listed.

| v0 function                                      | v2 module          | v2 function                       |
| ------------------------------------------------ | ------------------ | --------------------------------- |
| `createJob`                                      | `JobRegistry`      | `createJob`                       |
| `applyForJob`                                    | `JobRegistry`      | `applyForJob`                     |
| `validateJob`                                    | `ValidationModule` | `revealValidation(approve=true)`  |
| `disapproveJob`                                  | `ValidationModule` | `revealValidation(approve=false)` |
| `disputeJob`                                     | `JobRegistry`      | `raiseDispute`                    |
| `resolveDispute`                                 | `DisputeModule`    | `resolve`                         |
| `stakeAgent`                                     | `StakeManager`     | `depositStake(Role.Agent)`        |
| `stake` (validator)                              | `StakeManager`     | `depositStake(Role.Validator)`    |
| `withdrawAgentStake`                             | `StakeManager`     | `withdrawStake(Role.Agent)`       |
| `withdrawStake` (validator)                      | `StakeManager`     | `withdrawStake(Role.Validator)`   |
| `blacklistAgent` / `clearAgentBlacklist`         | `ReputationEngine` | `blacklist(user, status)`         |
| `blacklistValidator` / `clearValidatorBlacklist` | `ReputationEngine` | `blacklist(user, status)`         |
| `listNFT`                                        | `CertificateNFT`   | `list`                            |
| `purchaseNFT`                                    | `CertificateNFT`   | `purchase`                        |
| `delistNFT`                                      | `CertificateNFT`   | `delist`                          |

All other parameters—including the staking token and identity roots—are
exposed through owner‑only setters on the relevant v2 modules.
