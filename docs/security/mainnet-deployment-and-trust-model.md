# AGIJobManager v1 — Mainnet Deployment & Security Overview

> **Scope:** This document describes the **mainnet AGIJobManager v1** contract as verified on-chain at `0x0178b6bad606aaf908f72135b8ec32fc1d5ba477`. The Solidity source is **not** stored in this repo; operational behavior here is derived from the verified on-chain source and the repository’s Truffle build configuration. Treat this as a business-operated escrow + settlement engine, not a decentralized governance system.

## 1) Executive summary

AGIJobManager v1 is a **business-operated on-chain job escrow and settlement engine** with an integrated ERC‑721 receipt + marketplace flow. Employers escrow AGI tokens, agents deliver work, validators vote, and the contract pays out and mints an ERC‑721 receipt for the employer. It is **not** a DAO, **not** a trustless arbitration system, and **not** upgradeable via proxy. Control is centralized in an on-chain **owner** and a **moderator** set.

What it **is**:
- A single, owner‑operated contract that escrows ERC‑20 payments for jobs.
- A validator‑assisted approval/disapproval flow (with a moderator‑driven dispute override).
- An ERC‑721 receipt minted to the employer plus a built‑in NFT listing + purchase flow.

What it **is not**:
- A DAO or on‑chain governance system.
- A trustless arbitration mechanism (moderators decide disputes).
- An upgradeable proxy contract.

## 2) Trust model & roles

**Owner (centralized operator)**
- Pause/unpause the contract.
- Update token address, base IPFS URL, and platform copy strings.
- Set validator approval/disapproval thresholds, reputation thresholds, reward percentages, and job limits.
- Add/remove moderators.
- Add/remove additional agents/validators (allowlist bypass for ENS + Merkle checks).
- Blacklist agents/validators (no dedicated blacklist events).
- Withdraw any AGI balance via `withdrawAGI` (no escrow hard‑lock).
- Delist unassigned jobs on behalf of the employer.
- Configure per‑NFT payout percentages via `addAGIType`.

**Moderators**
- Resolve disputes via `resolveDispute(jobId, resolution)`.
- Outcomes are **string‑based** and binary: only the exact strings `"agent win"` or `"employer win"` trigger a payout path.

**Users**
- **Employer**: `createJob`, `cancelJob` (before assignment), `disputeJob`, and receives an ERC‑721 receipt on completion.
- **Agent**: `applyForJob`, `requestJobCompletion` (must be within job duration).
- **Validator**: `validateJob` or `disapproveJob` (ENS + Merkle‑gated unless allowlisted by owner).

## 3) Job lifecycle / state machine

**Key on‑chain fields** in the `Job` struct:
- `assignedAgent` (address)
- `assignedAt` (timestamp)
- `completed` (bool)
- `completionRequested` (bool)
- `validatorApprovals` / `validatorDisapprovals` (uint)
- `disputed` (bool)
- `validators` (address[])

### Happy path
1. **Create**: Employer calls `createJob`, escrowing `_payout` into the contract.
2. **Assign**: Agent calls `applyForJob`; contract records `assignedAgent` + `assignedAt`.
3. **Submit**: Agent calls `requestJobCompletion` (must be before `assignedAt + duration`).
4. **Validate**: Validators call `validateJob` until `validatorApprovals >= requiredValidatorApprovals`.
5. **Complete**: `_completeJob` pays the agent + validators, mints an ERC‑721 to the employer, and emits `JobCompleted`.

### Dispute path
- Validators can push the job into dispute by reaching `requiredValidatorDisapprovals` (which sets `disputed = true`), or the employer/agent can call `disputeJob`.
- A moderator calls `resolveDispute` with `"agent win"` or `"employer win"`.
  - **Agent win** triggers `_completeJob`.
  - **Employer win** returns the escrow to the employer.

### Timeouts & liveness
- **No `expireJob` / `finalizeJob` equivalents exist.** There is no on‑chain timeout or forced settlement path.
- The only explicit time check is in `requestJobCompletion` (must occur before `assignedAt + duration`).
- If the job expires or a dispute is never resolved, funds can remain stuck unless the owner intervenes with `withdrawAGI` (which is not escrow‑aware).

## 4) Treasury vs escrow separation (hard invariant)

**There is no `lockedEscrow` or `withdrawableAGI()` in v1.** The contract holds escrow and any other deposits in a single ERC‑20 balance. This means:
- The contract has **no on‑chain invariant** protecting active escrow from owner withdrawals.
- `withdrawAGI` can move **any** balance, even if jobs are active.

What becomes de‑facto treasury:
- Any remainder not paid to agents/validators (e.g., if agent payout % + validator reward % < 100).
- Any rounding dust from integer division.
- Direct `contributeToRewardPool` deposits (not segregated).

**Operational guidance:** treat treasury management as an **off‑chain policy**; the contract itself does not enforce escrow separation.

## 5) Identity wiring lock (`lockIdentityConfig`) — what it freezes and what it does not

`lockIdentityConfig` **does not exist** in AGIJobManager v1. Identity wiring is **implicitly locked by design** because:
- ENS + NameWrapper addresses, root nodes, and Merkle roots are set **only in the constructor**.
- There are **no setters** for those fields after deployment.

What remains adjustable:
- Owner‑managed allowlists (`addAdditionalAgent`, `addAdditionalValidator`).
- Blacklists, pause controls, economic parameters, and payout configuration.

**Recommended procedure**
1. Deploy with correct ENS registry, NameWrapper, and root/merkle configuration.
2. Smoke‑test `applyForJob` and `validateJob` using real subdomains.
3. Lock in operational access by adding/removing allowlisted actors as needed.

## 6) Pause semantics (exact behavior)

**Blocked while paused** (uses `whenNotPaused`):
- `createJob`
- `applyForJob`
- `requestJobCompletion`
- `validateJob`
- `disapproveJob`
- `disputeJob`
- `contributeToRewardPool`

**Allowed while paused** (not pause‑gated):
- `cancelJob`
- `delistJob` (owner)
- `resolveDispute` (moderator)
- `listNFT` / `purchaseNFT` / `delistNFT`
- `withdrawAGI` (owner)
- Blacklists, allowlist updates, and parameter setters

## 7) Security posture (operationally useful, non‑audit)

- **ReentrancyGuard** is applied to most external entrypoints that move funds (e.g., `createJob`, `applyForJob`, `validateJob`, `disapproveJob`, `disputeJob`, `cancelJob`, `resolveDispute`, `withdrawAGI`, `contributeToRewardPool`).
- **ERC‑20 transfers are raw** (`transfer`/`transferFrom`) with no `SafeERC20`; fee‑on‑transfer tokens may behave unexpectedly.
- **Validator payout loop is unbounded** (no explicit cap on the number of validators added to a job).
- **ENS/NameWrapper checks** are wrapped in `try/catch` and are view‑only.
- **Dispute outcomes are binary** and rely on exact string matching.
- **Centralized operator risk:** owner can withdraw escrow, change parameters, and pause/unpause at any time.

## 8) EIP‑170 bytecode size & build reproducibility

- **EIP‑170 runtime code limit**: 24,576 bytes.
- **No bytecode‑size guard** exists in this repo for AGIJobManager v1.

**Truffle compiler settings (repo):**
- `solc` **0.8.25**
- Optimizer **enabled** with **200 runs**
- `viaIR` **enabled**

**How to measure size locally (if you compile v1):**
```bash
jq -r '.deployedBytecode' build/contracts/AGIJobManager.json | wc -c
```

## 9) Verification & deployment guide (Truffle‑first)

**Mainnet deployment checklist:**
1. Confirm Truffle compiler settings match `truffle-config.js` (see above).
2. Compile and test (see Test Status below).
3. Record constructor args (token, ENS, NameWrapper, root nodes, Merkle roots, base IPFS URL).
4. Deploy via a multisig‑controlled account where possible.
5. Verify on Etherscan with the **exact** compiler version, optimizer runs, and constructor args.

**Repository scripts:**
- The `migrations/` scripts in this repo target the **v2 modular suite** and do **not** deploy AGIJobManager v1.
- For v1, use an **Etherscan deploy** or a custom Truffle migration that points at the verified v1 source.

## 10) Monitoring / alerting checklist

Index and alert on these events:
- `JobCreated`, `JobApplied`, `JobCompletionRequested`
- `JobValidated`, `JobDisapproved`, `JobDisputed`, `DisputeResolved`
- `JobCompleted`, `JobCancelled`
- `NFTIssued`, `NFTListed`, `NFTPurchased`, `NFTDelisted`
- `RewardPoolContribution`, `ReputationUpdated`
- `OwnershipVerified`, `RecoveryInitiated` (ENS/NameWrapper checks)
- `Paused`, `Unpaused` (from OpenZeppelin `Pausable`)

**Solvency invariant (operational):**
- There is **no on‑chain `lockedEscrow` invariant**. Operators should monitor whether the contract’s AGI balance covers the sum of open job payouts.

## 11) Known gaps / future work (non‑binding)

- **`additionalAgentPayoutPercentage` does not exist in v1**; payouts depend on `AGIType` configuration and can be 0 if no matching NFT is held.
- **Reward pool naming caveat:** `contributeToRewardPool` deposits are not segregated; they become part of the general balance.
- **Blacklist events:** blacklisting has no dedicated events; consider adding them in a future revision for monitoring parity.

## Test status

See [docs/test-status.md](../test-status.md) for the latest local Truffle compile/test results.
