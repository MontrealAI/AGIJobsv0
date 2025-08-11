# AGIJobs v2 Deployment with $AGIALPHA

This guide walks a non-technical owner through deploying and configuring the modular AGIJobs suite using the $AGIALPHA token (6 decimals) for payments, staking, rewards and disputes. All steps can be performed through [Etherscan](https://etherscan.io) once the bytecode for each module is verified.

## Prerequisites
- Ethereum wallet controlling the owner address (hardware wallet recommended).
- $AGIALPHA token contract: `0x2e8fb54c3ec41f55f06c1f082c081a609eaa4ebe`.
- Sufficient ETH for gas fees and $AGIALPHA for testing job flows.

## 1. Deploy the Modules
Deploy each contract in the order below. On Etherscan, open **Contract → Deploy**, connect your wallet, paste the verified bytecode, and enter constructor arguments exactly as shown.

| # | Module | Constructor arguments (example) |
| --- | --- | --- |
| 1 | StakeManager | `(tokenAddress, owner, treasury)` → `(0x2e8f...eabe, YOUR_ADDRESS, TREASURY_ADDRESS)` |
| 2 | JobRegistry | `(owner)` → `(YOUR_ADDRESS)` |
| 3 | ValidationModule | `(jobRegistry, stakeManager, owner)` → `(<JobRegistry>, <StakeManager>, YOUR_ADDRESS)` |
| 4 | ReputationEngine | `(owner)` → `(YOUR_ADDRESS)` |
| 5 | DisputeModule | `(jobRegistry, stakeManager, reputationEngine, owner)` → `(<JobRegistry>, <StakeManager>, <ReputationEngine>, YOUR_ADDRESS)` |
| 6 | CertificateNFT | `(name, symbol, owner)` → `("AGI Jobs", "AGIJOB", YOUR_ADDRESS)` |
| 7 | FeePool | `(token, stakeManager, rewardRole, owner)` → `(0x2e8f...eabe, <StakeManager>, 2, YOUR_ADDRESS)` |
| 8 | TaxPolicy | `(owner)` → `(YOUR_ADDRESS)` |
| 9 | *(Optional)* JobRouter/DiscoveryModule | per module docs |

After each deployment, note the contract address for later wiring.

**Example Etherscan deployment**
1. Search for the compiled contract on Etherscan and open the **Contract → Verify and Publish** page. Upload the flattened source to verify bytecode.
2. Once verified, switch to **Contract → Deploy**, paste the constructor arguments in the order shown above, and press **Write**.
3. Confirm the transaction in your wallet and record the resulting contract address.

## 2. Wire the Modules
Using Etherscan's **Write Contract** tab, submit the following transactions in order:
1. In **JobRegistry**, call `setModules(validation, stakeManager, reputation, dispute, certificate)`.
2. In **StakeManager**, call `setJobRegistry(jobRegistry)`.
3. Back in **JobRegistry**, call `setFeePool(feePool)` then `setFeePct(pct)` to choose the percentage of each job reward routed to the pool.
4. Finally, on **JobRegistry** call `setTaxPolicy(taxPolicy)` and optionally `bumpTaxPolicyVersion`.

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

## Troubleshooting & Security Tips
- **Mismatched constructor inputs** – double‑check the argument order if deployment reverts.
- **Missing module links** – if a call fails with "job registry" or similar, ensure `setModules` and `setJobRegistry` have been executed.
- **Stuck transactions** – increase gas price or use your wallet’s speed‑up feature.
- **Verify addresses** on at least two explorers before wiring modules.
- **Protect the owner key** – use a hardware wallet or multisig and avoid untrusted networks.
- **Keep records** of constructor parameters and ABIs for later verification.

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
