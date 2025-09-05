# Deployment Guide: AGIJobs v2 with $AGIALPHA

For the primary production deployment workflow see [deployment-production-guide.md](deployment-production-guide.md).

This walkthrough shows a non‑technical owner how to deploy and wire the modular v2 contracts using the 18‑decimal **$AGIALPHA** token. For a deeper explanation of how the modules interact, consult [architecture-v2.md](architecture-v2.md). The canonical token is deployed separately on mainnet; this repository includes [`contracts/test/AGIALPHAToken.sol`](../contracts/test/AGIALPHAToken.sol) solely for local testing. By default $AGIALPHA handles all payments, staking, rewards, and dispute deposits. All steps can be executed from a browser via [Etherscan](https://etherscan.io) or any compatible block explorer. For screenshot‑driven instructions, see [etherscan-guide.md](etherscan-guide.md).

## 1. Prerequisites

- A wallet with sufficient ETH for gas.
- The verified `$AGIALPHA` token contract address.
- The compiled bytecode for each module (already provided in this repository).
- Awareness that all contracts are **Ownable**; keep the deploying wallet secure.
- The deploying address automatically becomes the owner; constructors no longer take an `owner` parameter.

> **Regulatory notice:** On‑chain rewards minimise reporting requirements but do **not** remove your duty to obey local laws. Consult professionals before proceeding.

## 2. Deploy core modules

Deploy each contract **in the order listed below** from the **Write Contract** tabs (the deployer automatically becomes the owner). Addresses for dependent modules may be passed at deployment or left as `0` and wired later, except `ReputationEngine` which now requires a valid `StakeManager` address. Parameters may be left as `0` to accept the defaults shown below:

1. Use the existing `$AGIALPHA` token. Deploy [`AGIALPHAToken.sol`](../contracts/test/AGIALPHAToken.sol) only on local networks and call `mint(to, amount)` to create a test supply.
2. `StakeManager(token, minStake, employerPct, treasuryPct, treasury)` – pass `address(0)` for `token` to use the default $AGIALPHA and `0,0` for the slashing percentages to send 100% of any slash to the treasury.
3. `JobRegistry(validation, stakeMgr, reputation, dispute, certNFT, feePool, taxPolicy, feePct, jobStake)` – leaving `feePct = 0` applies a 5% protocol fee. Supplying a nonzero `taxPolicy` sets the disclaimer at deployment; otherwise the owner may call `setTaxPolicy` later.
4. `ValidationModule(jobRegistry, stakeManager, commitWindow, revealWindow, minValidators, maxValidators, validatorPool)` – zero values default to 1‑day windows and a 1–3 validator set.
5. `ReputationEngine(stakeManager)` – requires a valid `StakeManager` address.
6. `DisputeModule(jobRegistry, disputeFee, disputeWindow, moderator)` – manages
   appeals and dispute fees. The fourth argument optionally seeds an initial
   moderator; the deployer remains owner and can add weighted moderators with
   `addModerator(addr, weight)`.
7. `CertificateNFT(name, symbol)` – certifies completed work.
8. `FeePool(token, stakeManager, burnPct, treasury)` – rewards default to platform stakers; use `address(0)` for `token` to fall back to $AGIALPHA`and`burnPct`defaults to`0`.
9. `PlatformRegistry(stakeManager, reputationEngine, minStake)` – `minStake` may be `0`.
10. `JobRouter(platformRegistry)` – stake‑weighted job routing.
11. `PlatformIncentives(stakeManager, platformRegistry, jobRouter)` – helper that lets operators stake and register with routing in one call. For simple flows without `JobRouter`, call `PlatformRegistry.stakeAndRegister(amount)` or `acknowledgeStakeAndRegister(amount)` directly.
12. `ModuleInstaller()` – optional `Ownable` helper for wiring modules after deployment.

After each deployment, copy the address for later wiring.

## 3. Wire the modules

If addresses were not supplied during deployment, transfer ownership of each module to the `ModuleInstaller` and, from the owner's account, call:

```
ModuleInstaller.initialize(jobRegistry, stakeManager, validationModule, reputationEngine, disputeModule, certificateNFT, platformIncentives, platformRegistry, jobRouter, feePool, taxPolicy)
```

This `onlyOwner` call sets cross‑links, assigns the fee pool and optional tax policy, registers `PlatformIncentives` with both the `PlatformRegistry` and `JobRouter`, then automatically transfers ownership of all modules back to you.

Owners can retune parameters any time: `setMinStake`, `FeePool.setBurnPct`, `PlatformRegistry.setBlacklist`, etc.

## 4. One-call helper summary

| Participant                      | Helper                                                                               | Purpose                                    |
| -------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| Employer                         | `JobRegistry.acknowledgeAndCreateJob(reward, uri)`                                   | Accept tax policy and post a job           |
| Agent                            | `JobRegistry.stakeAndApply(jobId, amount)`                                           | Deposit stake and apply in one call        |
| Platform operator (no routing)   | `PlatformRegistry.stakeAndRegister(amount)` or `acknowledgeStakeAndRegister(amount)` | Stake and register without routing         |
| Platform operator (with routing) | `PlatformIncentives.stakeAndActivate(amount)`                                        | Stake and register for routing and rewards |

## 5. Stake and register a platform

1. In `$AGIALPHA`, approve the `StakeManager` for the desired amount (`1 token = 1_000000000000000000`, `0.1 token = 100000000000000000`).
2. Call `PlatformIncentives.stakeAndActivate(amount)` from the operator's address to register and enable routing. The helper stakes tokens, registers the platform in `PlatformRegistry`, and enrolls it with `JobRouter` for routing priority.
3. If routing is unnecessary, call `PlatformRegistry.stakeAndRegister(amount)` or `acknowledgeStakeAndRegister(amount)` instead.
4. The owner may register with `amount = 0` to appear in registries without fee or routing boosts.

## 6. Claim fees and rewards

- Employers send job fees directly to the `StakeManager`, which forwards them to `FeePool`.
- Anyone may trigger `FeePool.distributeFees()`; rewards accrue to stakers according to `stake / totalStake`.
- Operators withdraw with `FeePool.claimRewards()`.

## 7. Dispute resolution

- The disputing agent approves the `StakeManager` for the configured `appealFee` in `$AGIALPHA` and calls `JobRegistry.acknowledgeAndDispute(jobId, evidence)`; no ETH is ever sent.
- The `DisputeModule` escrows the token fee and releases it to the winner or back to the payer after resolution.
- Disputes resolve when the owner calls `resolve` or when moderator
  signatures representing more than half of the total assigned weight approve
  the outcome. Moderators and their weights are managed with
  `addModerator` and `removeModerator`.

## 8. Final checks

- Before staking or claiming rewards, each address must call `JobRegistry.acknowledgeTaxPolicy()`.
- Verify that `isTaxExempt()` on every module returns `true` to confirm contracts remain tax neutral.

## 9. Safety reminders

- Verify all addresses on multiple explorers before transacting.
- Record every parameter change after calling owner setters.
- Keep backups of deployment scripts and verify source code to improve transparency.

Deployers and operators remain solely responsible for legal compliance. The protocol never issues tax forms or collects personal data.
