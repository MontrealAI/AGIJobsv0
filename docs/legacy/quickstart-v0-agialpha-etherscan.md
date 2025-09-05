> **Note:** Current deployments use an 18-decimal AGIALPHA token.

# Quickstart: Deploying AGIJobManager v0 with $AGIALPHA on Etherscan

This abbreviated guide walks an owner through deploying the monolithic
`AGIJobManager v0` contract and interacting with it using the 18‑decimal
`$AGIALPHA` token. All parameters—including the token address, ENS
roots and Merkle roots—remain owner‑configurable after deployment.

## 1. Deploy the contract

1. Open the verified `AGIJobManager v0` code on Etherscan and choose
   **Contract → Deploy**.
2. Enter constructor parameters:
   - `_agiTokenAddress` – `$AGIALPHA` token address.
   - `_baseIpfsUrl` – prefix for job result URIs, e.g. `ipfs://`.
   - `_ensAddress` / `_nameWrapperAddress` – official ENS contracts.
   - `_clubRootNode` / `_agentRootNode` – namehashes for `club.agi.eth`
     and `agent.agi.eth` or `0x00` to disable ENS gating.
   - `_validatorMerkleRoot` / `_agentMerkleRoot` – allowlist roots or
     `0x00` for open access.
3. Submit the transaction; the sender becomes `owner` and may later
   retune any parameter via the contract's write methods.

## 2. Approve tokens and stake

All token amounts use 18‑decimal units (`1 AGIALPHA = 1_000000000000000000`).

1. **Employers** approve the job reward on `$AGIALPHA` then call
   `createJob` with `reward` and a metadata URI.
2. **Agents** stake via `stakeAgent(amount)` and apply with
   `applyForJob(jobId, subdomain, proof)`.
3. **Validators** stake with `stake(amount)` and later validate jobs.

## 3. Typical job flow

1. **Create job** – employer calls `createJob` after approving tokens.
2. **Apply** – agent calls `applyForJob` with ENS subdomain and optional
   Merkle proof.
3. **Validate** – selected validators call `validateJob` or
   `disapproveJob` after the agent submits results.
4. **Dispute** – if necessary, `disputeJob` escrows the dispute fee and
   `resolveDispute` finalises the outcome.

Throughout the lifecycle the owner may update the payout token with
`updateAGITokenAddress` (legacy), adjust ENS roots or Merkle proofs, and tweak
limits such as `setMaxJobPayout` or `setValidationRewardPercentage`
without redeploying the contract.
