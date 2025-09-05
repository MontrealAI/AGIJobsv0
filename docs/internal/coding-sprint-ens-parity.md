# Coding Sprint: ENS Identity & v1 Feature Parity

This sprint ports every capability from `legacy/AGIJobManagerv0.sol` into the modular AGI Jobs v2 suite while enforcing Ethereum Name Service (ENS) subdomain identities for agents and validators. The plan maintains owner control over all parameters and keeps the default payout token as the 18‑decimal `$AGIALPHA`.

## Goals

- Mirror v0 behaviour across dedicated v2 modules.
- Require each agent to own a subdomain of `agent.agi.eth` and each validator a subdomain of `club.agi.eth` (or be owner‑approved).
- Preserve owner flexibility: allowlists and parameter tuning without redeployment.
- Keep explorer interactions simple for non‑technical users.

## Tasks

### 1. Identity Verification

- Implement an `ENSOwnershipVerifier` library replicating the `_verifyOwnership` logic from v0 (Merkle proof → NameWrapper → resolver fallback) and emitting `OwnershipVerified`/`RecoveryInitiated`.
- Store `agentRootNode`, `clubRootNode`, `agentMerkleRoot`, and `validatorMerkleRoot` with owner setters and `RootNodeUpdated`/`MerkleRootUpdated` events.
- Add `addAdditionalAgent/Validator` and blacklist controls in `ReputationEngine`.
- Call the verifier from `JobRegistry.applyForJob` and validator commit/reveal functions in `ValidationModule`.

### 2. Job Lifecycle

- **JobRegistry**: implement `createJob`, `applyForJob`, `submit`, `finalize`, `cancelJob`, `forceCancel`, and `dispute` mirroring v0 semantics. Enforce max payout/duration caps and tax‑policy acknowledgement.
- **ValidationModule**: pseudo‑random validator selection, `commitValidation`, `revealValidation`, tallying approvals/disapprovals, and notifying `JobRegistry` of outcomes.
- **DisputeModule**: `raiseDispute` and moderator `resolve` with appeal‑fee escrow.
- **CertificateNFT**: `mint` on completion plus marketplace functions `list`, `purchase`, and `delist`.

### 3. Reputation & Rewards

- **ReputationEngine**: logarithmic growth formula, premium threshold view, and blacklist storage. Provide `onApply`, `onFinalize`, and `rewardValidator` hooks.
- **StakeManager**: custody `$AGIALPHA` (token address fixed at deployment), minimum stakes, slashing percentages, fee/burn ratios, and AGIType payout bonuses.
- Pay agents and validators via `StakeManager.release` and update reputation on success; handle slashing and refunds on failure.

### 4. Administration & Upgradability

- Expose owner setters for validator committee size, commit/reveal windows, job caps, validation reward percentage, fee shares, and base NFT URI.
- Keep modules ownable and pausable where necessary. Ensure `JobRegistry.setModules` wires module addresses and emits `ModulesUpdated`.

### 5. Testing & Verification

- Write Hardhat/Foundry tests covering:
  - Agent/validator identity checks (Merkle, NameWrapper, resolver paths).
  - Full job flow: post → apply → submit → commit/reveal → finalize.
  - Dispute resolution and stake slashing.
  - NFT marketplace operations.
- Run `npx hardhat test`, `forge test`, `npx solhint 'contracts/**/*.sol'`, and `npx eslint .` until clean.

## Definition of Done

- All v0 features available through v2 modules with ENS identity enforcement.
- Owner can retune parameters via setters without redeployment.
- Documentation updated (`README.md`, `docs/architecture-v2.md`, and this sprint plan).
- All tests and linters pass.
