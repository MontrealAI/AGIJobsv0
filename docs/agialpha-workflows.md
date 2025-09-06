# $AGIALPHA Operational Workflows

This guide summarises Etherscan-based interactions for the $AGIALPHA-powered AGIJobs v2 suite. All token amounts use 18‑decimal base units (`1 AGIALPHA = 1_000000000000000000`). Agents must control a subdomain ending in `.agent.agi.eth`; validators require `.club.agi.eth`. Replace bracketed addresses with deployment values before transacting.

## 1. Post a Job (Employer)

1. **Approve reward** – open the [$AGIALPHA token Write tab](https://etherscan.io/address/0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA#writeContract) and call `approve(spender, amount)` where `spender` is the `StakeManager` and `amount` is `reward + fee` in base units.
2. **Create job** – on [`JobRegistry` Write](https://etherscan.io/address/<JobRegistryAddress>#writeContract) call `acknowledgeAndCreateJob(reward, uri)`.

## 2. Apply for a Job (Agent)

1. **Stake (if required)** – approve the stake amount and call `StakeManager.depositStake(0, amount)` or use `JobRegistry.stakeAndApply(jobId, amount)`.
2. **Apply** – in `JobRegistry` call `applyForJob(jobId, subdomain, proof)` using your `.agent.agi.eth` label and Merkle proof.

## 3. Validate Work (Validator)

1. **Stake** – approve tokens and call `StakeManager.depositStake(1, amount)`.
2. **Commit** – during the commit window call `ValidationModule.commitValidation(jobId, hash, subdomain, proof)` with your `.club.agi.eth` label.
3. **Reveal** – when the reveal window opens call `ValidationModule.revealValidation(jobId, approve, salt, subdomain, proof)`.

## 4. Raise a Dispute (Anyone)

1. **Approve fee** – approve the dispute fee for `StakeManager` (e.g., `10_000000000000000000` for 10 tokens).
2. **Raise** – on [`DisputeModule` Write](https://etherscan.io/address/<DisputeModuleAddress>#writeContract) call `raiseDispute(jobId, evidence)` before the window ends.
3. **Resolve** – after the window a majority of moderators (or the owner) calls `resolve(jobId, verdict, signatures)`.

## 5. Trade a Certificate (Peer to Peer)

1. **List** – certificate owner calls `list(tokenId, price)` on [`CertificateNFT` Write](https://etherscan.io/address/<CertificateNFTAddress>#writeContract)` using 18‑decimal pricing.
2. **Purchase** – buyer approves the NFT contract for `price` tokens and calls `purchase(tokenId)`.
3. **Delist** – seller may remove a listing with `delist(tokenId)`.

### Additional Flows

- **Register a Platform** – stake with `depositStake(2, amount)` then call `PlatformRegistry.register()`.
- **Claim Protocol Fees** – anyone calls `FeePool.distributeFees()`; stakers withdraw via `FeePool.claimRewards()`.

### Base‑Unit Examples

```
1.0 AGIALPHA  = 1_000000000000000000
0.5 AGIALPHA  =   500000000000000000
25  AGIALPHA  = 25_000000000000000000
```

Verify all addresses on multiple explorers and keep owner keys in secure wallets. All modules reject direct ETH and rely solely on $AGIALPHA for value transfer.
