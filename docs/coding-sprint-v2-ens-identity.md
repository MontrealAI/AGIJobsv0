# Coding Sprint: ENS Identity & v1 Feature Parity

This sprint modularises all behaviour from `AGIJobManagerv0.sol` into the v2 architecture while enforcing ENS subdomain identity.

## Objectives
- Require `*.agent.agi.eth` for agents and `*.club.agi.eth` for validators.
- Preserve every feature from the legacy contract across the new modules.
- Keep the system owner‑configurable and friendly for block‑explorer users.

## Tasks

### 1. Identity Verification Library
- Build `ENSOwnershipVerifier` with Merkle proof, NameWrapper and resolver fallback.
- Emit `OwnershipVerified` and `RecoveryInitiated` events.
- Add owner setters for ENS registry, NameWrapper, root nodes and Merkle roots.
- Maintain `additionalAgents`/`additionalValidators` allow‑lists.

### 2. JobRegistry
- Port `createJob`, `applyForJob`, `submit`, `finalize`, `cancelJob`, `dispute` and `forceCancel`.
- On `applyForJob` call the verifier and check blacklists via `ReputationEngine`.
- Require tax policy acknowledgement before any state‑changing action.
- Enforce owner‑set `maxJobReward` and `maxJobDuration` limits.

### 3. ValidationModule
- Select validator committees and record commits & reveals.
- Accept votes only from identities passing the verifier or in the allow‑list.
- Finalise results once quorum or the reveal window ends.
- Report outcomes back to `JobRegistry`.

### 4. StakeManager
- Custody all funds in $AGIALPHA (6 decimals) with owner‑settable token address.
- Handle deposits, withdrawals, escrow locking, releases and slashing.
- Apply protocol fees and validator rewards; support AGIType payout bonuses.

### 5. ReputationEngine
- Implement logarithmic reputation growth with diminishing returns.
- Provide `onApply` and `onFinalize` hooks plus `rewardValidator`.
- Owner‑managed blacklist and premium threshold.

### 6. DisputeModule
- Allow `JobRegistry.dispute` to escrow dispute fees and trigger resolution.
- Moderator‑based `resolve(jobId, employerWins)` that directs `StakeManager` to refund or release.
- Owner setter to manage moderator addresses and dispute fee size.

### 7. CertificateNFT & Marketplace
- Mint one certificate per completed job to the worker.
- Add `list`, `purchase`, and `delist` functions using $AGIALPHA.
- Owner can set base URI and `JobRegistry` address.

### 8. Documentation & Tests
- Update `README.md` with an AGIALPHA deployment guide and Etherscan walkthrough.
- Add Hardhat tests covering identity checks, job lifecycle, validation, disputes and NFT marketplace.
- Run `npx solhint 'contracts/**/*.sol'`, `npx eslint .` and `npx hardhat test` until green.

## Definition of Done
- All v1 capabilities available through modular contracts.
- Agents and validators must own the correct ENS subdomain or be allow‑listed.
- Owner can retune parameters and swap the staking token without redeploying.
- Documentation enables non‑technical users to interact via a block explorer.
