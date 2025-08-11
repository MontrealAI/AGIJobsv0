# AGIJobs v2 Deployment with $AGIALPHA

This guide walks a non-technical owner through deploying and configuring the modular AGIJobs suite using the $AGIALPHA token (6 decimals) for payments, staking, rewards and disputes. All steps can be performed through [Etherscan](https://etherscan.io) once the bytecode for each module is verified.

## Prerequisites
- Ethereum wallet controlling the owner address (hardware wallet recommended).
- $AGIALPHA token contract: `0x2e8fb54c3ec41f55f06c1f082c081a609eaa4ebe`.
- Sufficient ETH for gas fees and $AGIALPHA for testing job flows.

## 1. Deploy the Modules
1. **StakeManager** – constructor arguments `(tokenAddress, owner, treasury)`.
2. **JobRegistry** – constructor argument `owner`.
3. **ValidationModule** – constructor arguments `(jobRegistry, stakeManager, owner)`.
4. **ReputationEngine** – constructor argument `owner`.
5. **DisputeModule** – constructor arguments `(jobRegistry, stakeManager, reputationEngine, owner)`.
6. **CertificateNFT** – constructor arguments `(name, symbol, owner)`.
7. **FeePool** – constructor arguments `(token, stakeManager, rewardRole, owner)`; set `rewardRole` to `2` for platform operators.
8. **TaxPolicy** – constructor argument `owner`.
9. *(Optional)* **JobRouter** and **DiscoveryModule** for stake‑weighted routing and search.

Use the *Deploy* tab on each contract's Etherscan page. Confirm transactions through your wallet.

## 2. Wire the Modules
1. In **JobRegistry**, call `setModules(validation, stakeManager, reputation, dispute, certificate)`.
2. In **StakeManager**, call `setJobRegistry(jobRegistry)`.
3. In **JobRegistry**, call `setFeePool(feePool)` then `setFeePct(pct)` to choose the percentage of each job reward routed to the pool.
4. In **JobRegistry**, call `setTaxPolicy(taxPolicy)` and optionally `bumpTaxPolicyVersion`.

## 3. Configure Token Parameters
The StakeManager already points to $AGIALPHA (6 decimals). To change tokens later, call `setToken(newToken)` on `StakeManager` and `FeePool` (and on `GovernanceReward` if used).

For stakes, rewards and fees enter values in base units (all amounts are scaled by `10**6`):
- `1` token = `1_000_000`
- `100` tokens = `100_000000`
- `0.5` token = `500000`

If interacting with an 18‑decimal token, divide values by `1e12` to convert to this 6‑decimal format; the division may truncate precision beyond six decimals.

Update parameters as needed:
- `StakeManager.setMinStake(minStake)`
- `StakeManager.setSlashingPercentages(employerPct, treasuryPct)`
- `ValidationModule.setParameters(...)`
- `DisputeModule.setAppealFee(fee)` (denominated in $AGIALPHA)
- `FeePool.setBurnPct(pct)` to automatically destroy a portion of each fee

## 4. Post a Job
1. Employer approves $AGIALPHA to the StakeManager via the token's `approve` function. The approval must cover the reward plus the protocol fee (`reward * feePct / 100`).
2. Employer calls `JobRegistry.acknowledgeTaxPolicy()` once per address.
3. Employer calls `JobRegistry.createJob(uri, reward)` where `reward` is in base units.

## 5. Agent and Validator Actions
- **Agents** stake using `StakeManager.depositStake(amount)` and apply with `JobRegistry.applyForJob(jobId)`.
- **Validators** stake similarly, then use `ValidationModule.commit(jobId, hash)` and later `reveal(jobId, approve, salt)`.

## 6. Finalisation and Disputes
- After validation, anyone may call `JobRegistry.finalize(jobId)` to release escrowed $AGIALPHA.
- If contested, raise an appeal with `DisputeModule.raiseDispute(jobId)`. Fees are charged in $AGIALPHA.

## 7. Platform Operator Rewards
Platform owners stake under `Role.Platform` via `StakeManager.depositStake(2, amount)`. As jobs finalize, `FeePool` receives the protocol fee and streams rewards. Operators claim with `FeePool.claimRewards()` directly through Etherscan.

## 8. Changing the Token
Only the owner may switch currencies: invoke `setToken(newToken)` on `StakeManager`, `FeePool`, and any reward modules. Existing stakes and escrows remain untouched; new deposits and payouts use the updated token.

## Security Notes
- Verify each deployed address on at least two explorers.
- Use multisig or timelock for the owner where possible.
- Keep constructor parameters and ABI files for later verification.

By following these steps the owner can deploy the AGIJobs suite with $AGIALPHA as the unit of account, while retaining the ability to replace the token without redeploying other modules.

## Etherscan Walkthrough

1. **Open contract pages** – for each deployed module, navigate to its Etherscan address and select **Contract → Write Contract**. Click **Connect to Web3** with the owner wallet.
2. **Wire modules**
   - In `JobRegistry` call `setModules(validation, stakeManager, reputation, dispute, certificate)`.
   - In `StakeManager` call `setJobRegistry(jobRegistry)`.
   - Back in `JobRegistry` call `setFeePool(feePool)` then `setFeePct(pct)` and `setTaxPolicy(taxPolicy)`.
3. **Configure economics**
   - On `StakeManager` call `setMinStake(amount)` and `setSlashingPercentages(empPct, treasuryPct)`.
   - On `ValidationModule` call `setParameters(...)` with 6‑decimal base units.
   - On `DisputeModule` call `setAppealFee(fee)` and link any reward pools via `setFeePool(feePool)`.
   - On `FeePool` call `setBurnPct(pct)` to destroy a portion of each fee.
4. **Verify state** – after each transaction switch to **Read Contract** to confirm the new values and emitted events.
5. **Stay safe** – double‑check addresses, keep keys on hardware or multisig wallets, and never interact from untrusted networks.

This sequence covers the critical owner‑only setters needed to bootstrap the system. For background on module responsibilities and token math, refer back to the sections above.
