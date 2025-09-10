# Coding Sprint: ENS Identity & v1 Feature Parity

This sprint modularises all behaviour from `AGIJobManagerv0.sol` into the v2 architecture while enforcing ENS subdomain identity.

## Objectives

- Require `*.agent.agi.eth` for agents and `*.club.agi.eth` for validators.
- Preserve every feature from the legacy contract across the new modules.
- Keep the system owner‑configurable and friendly for block‑explorer users.

## Tasks

### 1. Identity Verification Library

- Build `ENSOwnershipVerifier` mirroring v0's `_verifyOwnership`: first attempt Merkle proof, then check NameWrapper `ownerOf`, and finally fall back to resolver `addr` lookup.
- Emit `OwnershipVerified` and `RecoveryInitiated` events on success or failed external calls.
- Store `agentRootNode`, `clubRootNode`, `agentMerkleRoot` and `validatorMerkleRoot`; owner setters (`setAgentRootNode`, `setClubRootNode`, `setAgentMerkleRoot`, `setValidatorMerkleRoot`) fire `RootNodeUpdated`/`MerkleRootUpdated` events.
- Provide `addAdditionalAgent`/`addAdditionalValidator` and removal counterparts so the owner can override identity checks.
- Expose helper `isAuthorizedAgent`/`isAuthorizedValidator` that consults allow‑lists and `ReputationEngine.isBlacklisted` before allowing any action. These helpers are read-only and emit no events; use `verifyAgent`/`verifyValidator` for event emission when needed.

### 2. JobRegistry

- Port `createJob`, `applyForJob`, `submit`, `finalize`, `cancelJob`, `dispute` and `forceCancel`.
- On `applyForJob` use `isAuthorizedAgent`; ensure `ReputationEngine.isBlacklisted` blocks flagged addresses and respect `additionalAgents` allow‑list toggles.
- Require tax policy acknowledgement before any state‑changing action.
- Enforce owner‑set `maxJobReward` and `maxJobDuration` limits.
- After successful validation call `StakeManager.release` for payouts, `ReputationEngine.onFinalize` for reputation, and `CertificateNFT.mint` for credentials.
- Mirror v1 event names and cross‑check `../legacy/v0-v2-function-map.md` to ensure feature parity.

### 3. ValidationModule

- Select validator committees and record commits & reveals.
- Accept votes only from identities passing the read-only `isAuthorizedValidator` check (allow‑list or ENS ownership and not blacklisted).
- Finalise results once quorum or the reveal window ends, tallying approvals vs. disapprovals against owner‑set thresholds.
- Report outcomes back to `JobRegistry` for payout or dispute routing.
- Use deterministic on‑chain randomness; avoid Chainlink VRF or subscription services.

### 4. StakeManager

- Custody all funds in $AGIALPHA (18 decimals) with a fixed token address.
- Handle deposits, withdrawals, escrow locking, releases and slashing.
- Apply protocol fees and validator rewards; expose `getTotalPayoutPct` for NFT boosts and weight per‑job validator splits by this multiplier.
- Provide a `contribute` function for reward‑pool top‑ups to match v1's `contributeToRewardPool` and emit `RewardPoolContribution`.

### 5. ReputationEngine

- Implement logarithmic reputation growth with diminishing returns.
- Provide `onApply` and `onFinalize` hooks plus `rewardValidator`.
- Owner‑managed blacklist and premium threshold.

### 6. DisputeModule

- Allow `JobRegistry.dispute` to escrow dispute fees and trigger resolution.
- Majority‑signed `resolve(jobId, employerWins, signatures)` directing `StakeManager` to refund or release.
- Owner setter to manage moderator addresses, weights, and dispute fee size.

### 7. CertificateNFT & Marketplace

- Mint one certificate per completed job to the worker.
- Add `list`, `purchase`, and `delist` functions using $AGIALPHA`; transfer proceeds to the seller.
- Owner can set base URI and `JobRegistry` address.

### 8. Documentation & Tests

- Update `README.md` with an AGIALPHA deployment guide and Etherscan walkthrough.
- Add Hardhat tests covering identity checks, job lifecycle, validation, disputes and NFT marketplace.
- Run `npx solhint 'contracts/**/*.sol'`, `npx eslint .` and `npx hardhat test` until green.
- Verify coverage against `../legacy/v0-v2-function-map.md` so every v1 function has a v2 counterpart.

## Definition of Done

- All v1 capabilities available through modular contracts.
- Agents and validators must own the correct ENS subdomain or be allow‑listed.
- Owner can retune parameters and swap the staking token without redeploying.
- Documentation enables non‑technical users to interact via a block explorer.
