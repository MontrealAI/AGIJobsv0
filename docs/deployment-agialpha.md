# Deployment Guide: AGIJobs v2 with $AGIALPHA

This walkthrough shows a non‑technical owner how to deploy and wire the modular v2 contracts using the 6‑decimal **$AGIALPHA** token. All steps can be executed from a browser via [Etherscan](https://etherscan.io) or any compatible block explorer.

## 1. Prerequisites

- A wallet with sufficient ETH for gas.
- The verified `$AGIALPHA` token contract address.
- The compiled bytecode for each module (already provided in this repository).
- Awareness that all contracts are **Ownable**; keep the deploying wallet secure.
- The deploying address automatically becomes the owner; constructors no longer take an `owner` parameter.

> **Regulatory notice:** On‑chain rewards minimise reporting requirements but do **not** remove your duty to obey local laws. Consult professionals before proceeding.

## 2. Deploy core modules

Deploy each contract from the **Write Contract** tabs (the deployer automatically becomes the owner):

1. `AGIALPHAToken()` – mint the initial supply to the owner or treasury.
2. `StakeManager(token, minStake, employerPct, treasuryPct, treasury, jobRegistry, disputeModule)` – records stake balances and holds job escrows.
3. `ValidationModule(jobRegistry, stakeManager)` – handles validation and slashing.
4. `ReputationEngine()` – optional reputation weighting.
5. `DisputeModule(jobRegistry, stakeManager)` – manages appeals and dispute fees.
6. `CertificateNFT(name, symbol)` – certifies completed work.
7. `FeePool(token, stakeManager, role)` – redistributes protocol fees to stakers.
8. `PlatformRegistry(stakeManager, reputationEngine, minStake)` – lists platform operators.
9. `JobRouter(platformRegistry)` – stake‑weighted job routing.
10. `PlatformIncentives(stakeManager, platformRegistry, jobRouter)` – helper that lets operators stake and register in one call.

After deploying these modules and recording their addresses, deploy the registry last:

11. `JobRegistry(validationModule, stakeManager, reputationEngine, disputeModule, certificateNFT, feePool, taxPolicy, feePct, jobStake)` – tracks jobs and tax acknowledgements.

## 3. Wire the modules

Use each contract's **Write** tab to connect remaining references:

- `StakeManager.setJobRegistry(jobRegistry)` and `StakeManager.setDisputeModule(disputeModule)` if not provided at deploy time.
- `PlatformRegistry.setRegistrar(platformIncentives, true)` and `JobRouter.setRegistrar(platformIncentives, true)`

Owners can retune parameters any time: `StakeManager.setToken`, `setMinStake`, `FeePool.setBurnPct`, `PlatformRegistry.setBlacklist`, etc. No redeployments are required when swapping tokens or adjusting fees.

## 4. Stake and register a platform

1. In `$AGIALPHA`, approve the `StakeManager` for the desired amount (`1 token = 1_000000`).
2. Call `PlatformIncentives.stakeAndActivate(amount)` from the operator's address. The helper stakes tokens, registers the platform in `PlatformRegistry`, and enrolls it with `JobRouter` for routing priority.
3. The owner may register with `amount = 0` to appear in registries without fee or routing boosts.

## 5. Claim fees and rewards

- Employers send job fees directly to the `StakeManager`, which forwards them to `FeePool`.
- Anyone may trigger `FeePool.distributeFees()`; rewards accrue to stakers according to `stake / totalStake`.
- Operators withdraw with `FeePool.claimRewards()`.

## 6. Dispute resolution

- Participants approve the `StakeManager` for the configured `appealFee` and call `JobRegistry.dispute(jobId)`.
- The `DisputeModule` holds the fee in `$AGIALPHA` and releases it to the winner or back to the payer after resolution.

## 7. Final checks

- Before staking or claiming rewards, each address must call `JobRegistry.acknowledgeTaxPolicy()`.
- Verify that `isTaxExempt()` on every module returns `true` to confirm contracts remain tax neutral.

## 8. Safety reminders

- Verify all addresses on multiple explorers before transacting.
- Record every parameter change after calling owner setters.
- Keep backups of deployment scripts and verify source code to improve transparency.

Deployers and operators remain solely responsible for legal compliance. The protocol never issues tax forms or collects personal data.

