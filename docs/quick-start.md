# Quick Start

This guide demonstrates the basic lifecycle of a job on AGIJobs using
`ethers.js` scripts. The examples assume the core contracts are already
deployed and that you have the contract addresses available. The `$AGIALPHA`
token itself is external; the repository's [`AGIALPHAToken`](../contracts/test/AGIALPHAToken.sol)
contract is provided only for local testing.

## 1. Post a Job

Employers escrow the reward and publish job metadata.

```javascript
// post-job.js
const token = await ethers.getContractAt('AGIALPHAToken', tokenAddress);
const stake = await ethers.getContractAt('StakeManager', stakeAddress);
const registry = await ethers.getContractAt('JobRegistry', registryAddress);

const reward = ethers.parseUnits('10', 18);
await token.approve(stakeAddress, reward);
await stake.depositStake(0, reward); // escrow for job
const tx = await registry.createJob(reward, 'ipfs://job.json');
const receipt = await tx.wait();
console.log(`Job ID: ${receipt.logs[0].args.jobId}`);
```

## 2. Apply to the Job

Agents stake and submit an application.

```javascript
// apply.js
const registry = await ethers.getContractAt('JobRegistry', registryAddress);
await registry.applyForJob(jobId, 'alice', merkleProof); // alice.agent.agi.eth
```

## 3. Validate the Submission

Validators commit and reveal votes on the submitted work.

```javascript
// validate.js
const validation = await ethers.getContractAt(
  'ValidationModule',
  validationAddress
);

// Commit phase
await validation.commitValidation(jobId, commitHash, 'alice', []); // alice.club.agi.eth

// Reveal phase
await validation.revealValidation(jobId, true, salt, 'alice', []);
```

## 4. Finalize

After validation succeeds, the employer must finalize the job to release
payment and mint a certificate.

```javascript
// finalize.js
const registry = await ethers.getContractAt('JobRegistry', registryAddress);
await registry.connect(employer).finalize(jobId);
```

## 5. Reward Boosts and Claims

Holding approved NFTs increases payouts by applying the highest percentage boost. Total multiplier = `max(payoutPct_i, 100)` capped by `maxTotalPayoutPct`.

Example: with `150%` and `125%` NFTs the multiplier remains `150%` and a `10` token reward pays `15`. Extra tokens are funded from the protocol fee and burn pool; if those pools cannot cover the bonus, finalization reverts with `InsufficientEscrow`.

Stakers who gain or lose NFTs should snapshot their weight before claiming:

```javascript
// sync-boost.js
await stake.syncBoostedStake(user.address, role); // 0=agent, 1=validator, 2=platform
```

`FeePool.claimRewards()` automatically calls this helper and pays out boosted rewards even when the multiplier exceeds `100%`.

## FAQ

**How do I get test tokens?** Use `AGIALPHAToken.mint()` from the deployer
account to mint yourself tokens in a development environment.

**Can I reuse these scripts on mainnet?** Yes, but ensure addresses and gas
settings are configured for the target network.

## Limitations

- **Centralized control:** Owners can currently change module addresses and a
  moderator resolves disputes, representing trust points.
- **Validator selection:** Validators are selected from a predefined pool rather
  than trustlessly.
- **Missing features:** No on‑chain governance, fee distribution is simplistic
  and there is no built‑in user interface.
