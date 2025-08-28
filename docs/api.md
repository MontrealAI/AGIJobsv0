# API Reference

Summary of the primary AGIJobs modules and their most useful functions.
Each snippet uses [ethers.js](https://docs.ethers.org/) and assumes the
contracts have already been deployed.  For full details see the individual
contract pages under `docs/api/`.

## AGIALPHAToken
ERC‑20 utility token used for payments and staking.

```javascript
const token = await ethers.getContractAt("AGIALPHAToken", tokenAddress);
await token.mint(user, ethers.parseUnits("1000", 6));
```

## StakeManager
Handles token staking, escrow and withdrawals.

- `depositStake(role, amount)` – stake tokens as agent (`0`) or validator (`1`).
- `withdrawStake(role, amount)` – remove previously staked tokens.

```javascript
await token.approve(stakeManagerAddress, stakeAmount);
await stakeManager.depositStake(0, stakeAmount); // agent stake
```

## JobRegistry
Coordinates job posting and settlement.

- `createJob(reward, uri)` – employer escrows tokens and posts job metadata.
- `applyForJob(jobId, label, proof)` – agent applies with ENS label and proof.
- `submit(jobId, resultHash, resultURI)` – agent submits work for validation.
- `finalize(jobId)` – release escrowed reward after validation succeeds.

```javascript
const registry = await ethers.getContractAt("JobRegistry", registryAddress);
const tx = await registry.createJob(ethers.parseUnits("10", 6), "ipfs://job.json");
const receipt = await tx.wait();
const jobId = receipt.logs[0].args.jobId;
```

## ValidationModule
Manages commit‑reveal voting by validators.

 - `start(jobId, entropy, extraEntropy)` – select validators and open the commit window. `extraEntropy` is mixed in when VRF randomness is unavailable.
 - `selectValidators(jobId, entropy)` – choose validators for a job.
- `commitValidation(jobId, commitHash)` / `revealValidation(jobId, approve, salt)` – validator vote flow.
- `finalize(jobId)` – tallies votes and notifies `JobRegistry`.

```javascript
await validation.commitValidation(jobId, commitHash);
await validation.revealValidation(jobId, true, salt);
```

## DisputeModule
Handles disputes raised against jobs.

- `raiseDispute(jobId)` – open a dispute on a job.
- `resolve(jobId, employerWins)` – moderator settles the dispute.

```javascript
await dispute.raiseDispute(jobId);
await dispute.resolve(jobId, true); // employer wins
```

## IdentityRegistry
Verifies agent and validator eligibility.

- `isAuthorizedAgent(account, label, proof)` – check if an address can work.
- `isAuthorizedValidator(account, label, proof)` – check validator eligibility.

```javascript
const ok = await identity.isAuthorizedAgent(user, labelHash, merkleProof);
```

## ReputationEngine
Tracks reputation scores for participants.

- `onApply(user)` / `onFinalize(user, success, payout, duration)` – hooks from `JobRegistry`.
- `getReputation(user)` – view current score.

```javascript
const rep = await reputationEngine.getReputation(user);
```

## CertificateNFT
ERC‑721 completion certificates with optional marketplace.

- `mint(to, jobId, uri)` – `JobRegistry` mints certificate.
- `list(tokenId, price)` / `purchase(tokenId)` – optional secondary market.

```javascript
await certificate.mint(agent, jobId, "ipfs://cert.json");
```

## FeePool
Stores platform fees and distributes rewards.

- `depositFee(amount)` – `StakeManager` deposits collected fees.
- `claimRewards()` – stakers withdraw accumulated rewards.

```javascript
await feePool.depositFee(feeAmount);
await feePool.claimRewards();
```

