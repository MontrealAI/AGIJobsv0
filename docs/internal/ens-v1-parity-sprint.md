# Coding Sprint: ENS Identity & v1 Feature Parity

This sprint migrates every capability from the legacy `AGIJobManager` into the modular v2 suite while enforcing ENS-based identity for agents and validators. It serves as a checklist for developers implementing the upgrade.

## 1. Identity Enforcement

- **Goal**: Every agent must control a subdomain of `agent.agi.eth`; every validator must control a subdomain of `club.agi.eth`.
- **Mechanism**:
  1. Accept a Merkle proof of pre-approved addresses. If the proof verifies, accept without further calls.
  2. Otherwise, compute the subnode hash and query ENS NameWrapper `ownerOf`. If the caller owns the NFT, accept.
  3. Fallback to the ENS resolver's `addr` record when NameWrapper doesn't resolve.
  4. Emit `OwnershipVerified(claimant, subdomain)` when any check passes and `RecoveryInitiated(reason)` on failures.
- **Integration**:
  - `JobRegistry.applyForJob` must require a valid agent subdomain and reject blacklisted or unapproved addresses.
  - `ValidationModule.commitValidation` and `revealValidation` must require a valid validator subdomain.
  - Maintain owner-managed allowlists (`additionalAgents`, `additionalValidators`) and blacklists in `ReputationEngine`.
  - Provide owner setters for root nodes, Merkle roots, ENS registry and NameWrapper addresses with update events.

## 2. Module Parity with v0

- **JobRegistry**
  - `createJob`, `applyForJob`, `submit`, `cancelJob`, `dispute`, `finalize`.
  - Enforce `maxJobReward` and `maxJobDuration` caps; require tax policy acknowledgement before participation.
- **ValidationModule**
  - Commit–reveal voting with owner-settable validator count and time windows.
  - Select eligible validators and tally approvals versus disapprovals.
- **StakeManager**
  - Handle stake deposits/withdrawals, job reward escrow, fee deductions, validator rewards and AGIType payout bonuses.
  - Owner setters: minimum stake and slashing percentages.
- **ReputationEngine**
  - Logarithmic reputation growth (`onApply`, `onFinalize`), premium threshold gating and owner-maintained blacklist.
- **DisputeModule**
  - `raiseDispute`, moderator or jury based `resolve`, optional dispute fees.
- **CertificateNFT**
  - Mint completion certificates and support `list`, `purchase`, `delist` marketplace actions.

## 3. Administrative Controls

- Each module inherits `Ownable`; only the owner can update parameters.
- No module routes funds to the owner; fees go to `FeePool` or are burned to preserve tax neutrality.
- Events now emit clarified lifecycle terminology (`JobCreated`, `ApplicationSubmitted`, `AgentAssigned`, `ResultSubmitted`, `JobFinalized`, etc.) while keeping the legacy aliases for indexer parity.

## 4. Testing and Verification

- Write Hardhat and Foundry tests for:
  - Successful job flow from creation to NFT minting.
  - Identity rejection paths for both agents and validators.
  - Dispute resolution and slashing.
  - NFT marketplace listing and purchase.
- Run `npx hardhat test`, `forge test`, `npx solhint 'contracts/**/*.sol'` and `npx eslint .` until all pass.

## 5. Deployment Notes

- Default token is `$AGIALPHA` (18 decimals) and cannot be swapped in v2.
- Document Etherscan-based deployment: deploy modules, call `setModules` on `JobRegistry`, then update Merkle roots and root nodes.

Completion of this sprint yields a v2 system with full feature parity, ENS identity enforcement and owner-controlled configurability without contract redeployment.
