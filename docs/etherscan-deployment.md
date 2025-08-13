# Etherscan Deployment Quickstart

All token amounts use the 6 decimal base units of $AGIALPHA (e.g., **1 AGIALPHA = 1_000_000 units**). Convert values before entering them on Etherscan.

## One-click Etherscan deployment

### Recommended constructor parameters

| Parameter | Recommended value |
| --- | --- |
| `token` | `0x2e8fb54C3EC41F55F06C1f082C081A609eAA4EbE` |
| `feePct` | `5` (protocol fee percentage) |
| `burnPct` | `0` (no burn) |
| `commitWindow` | `86400` seconds (24h) |
| `revealWindow` | `86400` seconds (24h) |

### Deployment order and wiring

1. Deploy `StakeManager(token, treasury)` with the token above and your treasury address.
2. Deploy `JobRegistry()`.
3. Deploy `TaxPolicy(uri, acknowledgement)` and call `JobRegistry.setTaxPolicy(taxPolicy)`.
4. Deploy `ValidationModule(jobRegistry, stakeManager, commitWindow, revealWindow, 1, 3, [])`.
5. Deploy `ReputationEngine()`.
6. Deploy `CertificateNFT("AGI Jobs", "AGIJOB")`.
7. Deploy `DisputeModule(jobRegistry, 0, owner, owner)`.
8. Deploy `FeePool(token, stakeManager, 2, burnPct, treasury)`.
9. Deploy `PlatformRegistry(stakeManager, reputationEngine, 0)`.
10. Deploy `JobRouter(platformRegistry)`.
11. Deploy `PlatformIncentives(stakeManager, platformRegistry, jobRouter)`.
12. Deploy `ModuleInstaller(owner)` with the address that will finalize wiring.
13. Transfer ownership of each module to the installer. From that owner address, call `ModuleInstaller.initialize(jobRegistry, stakeManager, validation, reputation, dispute, nft, platformIncentives, platformRegistry, jobRouter, feePool, taxPolicy)` **once**. Only the nominated owner may invoke `initialize`, and the installer blocks subsequent calls. The transaction wires modules, assigns the fee pool and optional tax policy, then transfers ownership back automatically. Finally authorize registrars:
    - `PlatformRegistry.setRegistrar(platformIncentives, true)`
    - `JobRouter.setRegistrar(platformIncentives, true)`
14. Verify each contract via **Contract → Verify and Publish** on Etherscan.

### Minimal ownership transfer example

1. Deploy `ModuleInstaller` with your address as `owner`.
2. On each module contract, call `transferOwnership(installer)`.
3. From that owner address, open **ModuleInstaller → Write Contract** and execute `initialize(jobRegistry, stakeManager, validation, reputation, dispute, nft, platformIncentives, platformRegistry, jobRouter, feePool, taxPolicy)`.
4. After the transaction, every module reports your address as `owner` again.

### Job posting, staking, and activation via Etherscan

1. **Post a job:** Approve the `StakeManager` to transfer `reward + fee`. On `JobRegistry`, call `acknowledgeAndCreateJob(reward, uri)`.
2. **Stake tokens:** After approving tokens, call `StakeManager.depositStake(role, amount)` (`0` = Agent, `1` = Validator, `2` = Platform).
3. **Activate a platform:** On `PlatformIncentives`, call `stakeAndActivate(amount)` to stake and register in one transaction.

### Owner-only setters

- `StakeManager.setToken(newToken)`
- `StakeManager.setMinStake(amount)`
- `JobRegistry.setFeePct(fee)`
- `ValidationModule.setCommitRevealWindows(commitWindow, revealWindow)`
- `FeePool.setBurnPct(pct)`
- `DisputeModule.setAppealFee(fee)`

## Distribute Fees

As jobs finalize, protocol fees accumulate in the FeePool. Anyone may trigger distribution.

1. Open **FeePool → Write Contract** and call **distributeFees()**.

## Claim Rewards

Stakers withdraw accrued fees from the same contract.

1. In **FeePool → Write Contract**, execute **claimRewards()**.

## Token Conversion Reference

- `1.0 AGIALPHA = 1_000_000 units`
- `0.5 AGIALPHA = 500_000 units`
- `25 AGIALPHA = 25_000_000 units`

Always enter values in base units on Etherscan.
