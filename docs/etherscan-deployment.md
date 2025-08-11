# Etherscan Deployment Quickstart

All token amounts use the 6 decimal base units of $AGIALPHA (e.g., **1 AGIALPHA = 1_000_000 units**). Convert values before entering them on Etherscan.

## 1. Deploy Each Module

Deploy contracts in the following order from Etherscan's **Contract → Deploy** tab. Use your owner address for every `owner` field.

| # | Module | Constructor arguments (example) |
| --- | --- | --- |
| 1 | StakeManager | `(token, owner, treasury)` → `(0x2e8f…eabe, YOU, TREASURY)` |
| 2 | JobRegistry | `(owner)` → `(YOU)` |
| 3 | ValidationModule | `(jobRegistry, stakeManager, owner)` → `(<JobRegistry>, <StakeManager>, YOU)` |
| 4 | ReputationEngine | `(owner)` → `(YOU)` |
| 5 | DisputeModule | `(jobRegistry, stakeManager, reputationEngine, owner)` → `(<JobRegistry>, <StakeManager>, <ReputationEngine>, YOU)` |
| 6 | CertificateNFT | `(name, symbol, owner)` → `("AGI Jobs", "AGIJOB", YOU)` |
| 7 | FeePool | `(token, stakeManager, rewardRole, owner)` → `(0x2e8f…eabe, <StakeManager>, 2, YOU)` |
| 8 | TaxPolicy | `(owner)` → `(YOU)` |
| 9 | PlatformIncentives | `(stakeManager, platformRegistry, feePool, owner)` or as required |

Record each address for later configuration.

## 2. Stake & Register a Platform

1. Approve the StakeManager to spend your $AGIALPHA.
2. On **PlatformIncentives → Write Contract**, call **stakeAndActivate(amount)** with the desired stake (base units, e.g., `25_000_000` for 25 tokens).

![1 - stakeAndActivate](https://via.placeholder.com/650x150?text=stakeAndActivate)

## 3. Distribute Fees

As jobs finalize, protocol fees accumulate in the FeePool. Anyone may trigger distribution.

1. Open **FeePool → Write Contract** and call **distributeFees()**.

![2 - distributeFees](https://via.placeholder.com/650x150?text=distributeFees)

## 4. Claim Rewards

Stakers withdraw accrued fees from the same contract.

1. In **FeePool → Write Contract**, execute **claimRewards()**.

![3 - claimRewards](https://via.placeholder.com/650x150?text=claimRewards)

## 5. Token Conversion Reference

- `1.0 AGIALPHA = 1_000_000 units`
- `0.5 AGIALPHA = 500_000 units`
- `25 AGIALPHA = 25_000_000 units`

Always enter values in base units on Etherscan.
