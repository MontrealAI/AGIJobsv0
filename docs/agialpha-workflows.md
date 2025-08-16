# $AGIALPHA Operational Workflows

This guide summarises common on-chain interactions for the $AGIALPHA-based AGIJobs v2 suite. All token amounts use 6‑decimal base units (`1 AGIALPHA = 1_000000`). Replace bracketed addresses with your deployment values before transacting.

## 1. Approve & Stake $AGIALPHA

1. **Approve tokens** – Open the [$AGIALPHA token Write tab](https://etherscan.io/address/0x2e8fb54C3EC41F55F06C1F082C081A609eAA4EbE#writeContract) and call `approve(spender, amount)`.
   - `spender`: `StakeManager` address.
   - `amount`: staking total in base units.
   - *Example*: approving 50 tokens → `50_000000`.
2. **Stake for a role** – On [StakeManager Write](https://etherscan.io/address/<StakeManagerAddress>#writeContract) call `depositStake(role, amount)`.
   - `role`: `0` Agent, `1` Validator, `2` Platform.
   - `amount`: must be approved above. Example agent stake of 10 tokens → `10_000000`.

## 2. Register a Platform

1. Stake as a platform operator with `depositStake(2, amount)` on StakeManager.
   - Example minimum stake of 25 tokens → `25_000000`.
2. Open [PlatformRegistry Write](https://etherscan.io/address/<PlatformRegistryAddress>#writeContract) and call `register()` (or `registerPlatform(operator)` if applicable) to list your platform for routing and fee shares.

## 3. Claim Protocol Fees

1. Check [FeePool Read](https://etherscan.io/address/<FeePoolAddress>#readContract) for `pendingFees()`.
2. If `pendingFees > 0`, anyone may call `distributeFees()` on [FeePool Write](https://etherscan.io/address/<FeePoolAddress>#writeContract) to allocate rewards.
3. Platform stakers withdraw earnings via `claimRewards()` on the same Write tab. Rewards stream in $AGIALPHA based on staked weight.

## 4. Dispute a Job

1. Ensure you have approved the `StakeManager` for at least the dispute fee. Example fee of 10 tokens → approve `10_000000`.
2. On [DisputeModule Read](https://etherscan.io/address/<DisputeModuleAddress>#readContract) check `disputeFee()` and `disputeWindow()`.
3. Call `raiseDispute(jobId, evidence)` on [DisputeModule Write](https://etherscan.io/address/<DisputeModuleAddress>#writeContract) before the dispute window ends. The StakeManager will lock the `disputeFee` from your wallet.
4. After the window elapses, an authorised arbiter resolves the case with `resolveDispute(jobId)`. Depending on the outcome, the dispute fee is returned or paid out via `StakeManager.payDisputeFee`.

---

### Base‑Unit Examples

```
1.0 AGIALPHA  = 1_000000
0.5 AGIALPHA  =   500000
25  AGIALPHA  = 25_000000
```

Verify all addresses on multiple explorers and keep owner keys in secure wallets. All modules reject direct ETH and rely solely on $AGIALPHA for value transfer.
