> **Note:** Current deployments use an 18-decimal AGIALPHA token.

# Deployment Guide: AGIJobManager v0 with $AGIALPHA

This guide walks a non‑technical owner through deploying the monolithic **AGIJobManager v0** contract using the 18‑decimal `$AGIALPHA` token for all escrow, staking, validator rewards, and dispute fees. Every parameter can be updated later by the owner without redeploying the contract.

## Prerequisites

- `$AGIALPHA` token address.
- ENS registry and NameWrapper addresses.
- Namehashes for `agent.agi.eth` and `club.agi.eth` plus optional Merkle roots for allowlists.
- Base IPFS URI for job result metadata.

## Deployment Steps

1. Open the compiled `AGIJobManagerv0` in a block explorer and supply constructor fields:
   - `_agiTokenAddress` – `$AGIALPHA` address.
   - `_baseIpfsUrl` – e.g. `ipfs://`.
   - `_ensAddress` and `_nameWrapperAddress` – official ENS contracts.
   - `_clubRootNode`, `_agentRootNode`, `_validatorMerkleRoot`, `_agentMerkleRoot` – `0x00` if unused.
2. Confirm transaction; the sender becomes the contract owner.
3. In the **Write Contract** tab the owner can:
   - Switch payout tokens with `updateAGITokenAddress(newToken)`.
   - Add allowlisted addresses via `addAdditionalAgent` or `addAdditionalValidator`.
   - Update ENS roots and Merkle proofs as identity policies change.
   - Tune parameters like `setRequiredValidatorApprovals`, `setValidationRewardPercentage`, `setMaxJobPayout`, and blacklist users.

## Usage Notes

- All token amounts use 18‑decimal units (`1 token = 1_000000000000000000`).
- Employers post jobs with `createJob` after approving the token.
- Agents call `applyForJob` with their subdomain and optional Merkle proof.
- Validators vote through `validateJob` or `disapproveJob` and earn rewards once `_completeJob` runs.
- The owner may refund or slash parties through dispute functions without ever redeploying the contract.

By keeping `$AGIALPHA` configurable through `updateAGITokenAddress` (legacy), the deployment stays flexible while offering a simple explorer‑based workflow for non‑technical participants.
