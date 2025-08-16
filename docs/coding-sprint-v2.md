# Coding Sprint: AGIJobManager v2 Modular Suite

This sprint turns the v2 architecture into production-ready code. Each task references the modules and interfaces defined in `contracts/v2` and described in `docs/architecture-v2.md`.

## Sprint Goals
- Implement immutable, ownable modules for job coordination, validation, staking, reputation, disputes and certificate NFTs.
- Optimise for gas efficiency and composability while keeping explorer interactions simple for non‑technical users.
- Align incentives so honest behaviour is the dominant strategy for agents, validators and employers.
- Default to the $AGIALPHA token (6 decimals) for all payments, stakes and dispute fees while allowing the owner to swap tokens via `StakeManager.setToken`.
- Publish an on-chain tax disclaimer that leaves all liabilities with employers, agents and validators while the owner remains exempt.

## Tasks
1. **Interface Stabilisation**
   - Finalise interfaces in `contracts/v2/interfaces`.
   - Add NatSpec comments and custom errors for clarity.
2. **Module Implementation**
   - `JobRegistry`: job lifecycle, wiring module addresses, owner configuration.
   - `ValidationModule`: pseudo‑random selection, commit‑reveal voting, outcome reporting.
   - `StakeManager`: token custody, slashing, reward release.
   - `ReputationEngine`: reputation tracking, threshold enforcement, owner-managed blacklist.
   - `DisputeModule`: optional dispute flow and final ruling with dispute fees paid in the configured ERC‑20.
   - `CertificateNFT`: ERC‑721 minting with owner‑settable base URI.
   - Wire `StakeManager` into all modules and expose `setToken` so the owner can replace $AGIALPHA without redeploying.
3. **Incentive Calibration**
   - Implement owner setters for stake ratios, rewards, slashing, timing windows and reputation thresholds.
   - Ensure slashing percentages exceed potential dishonest gains.
   - Route a share of slashed agent stake to the employer on failures.
4. **Testing & Simulation**
   - Write Hardhat tests covering happy paths and failure scenarios.
   - Simulate validator collusion, missed reveals and disputes to verify game‑theoretic soundness.
   - Run `npx hardhat test` and `forge test` until green.
5. **Gas & Lint Pass**
   - Profile gas with Hardhat's `--gas` flag; apply `unchecked` blocks where safe.
   - Run `npx solhint 'contracts/**/*.sol'` and `npx eslint .`.
6. **Deployment Prep**
   - Freeze compiler versions and verify bytecode locally.
   - Generate deployment scripts that record module addresses for `JobRegistry` wiring.
   - Document Etherscan-based deployment and configuration for non‑technical owners.
7. **Tax Responsibility & Owner Neutrality**
   - Ensure no module ever routes tokens or fees to the owner; the contracts and deploying corporation must remain revenue-free and tax-exempt worldwide.
   - Require participants to call `acknowledgeTaxPolicy` before interacting with `JobRegistry`, tracking acknowledgements per address.
   - Wire the owner-controlled `TaxPolicy` into `JobRegistry` and surface `taxPolicyDetails()` so explorers can display the canonical acknowledgement and policy URI.
   - Guarantee only the owner can update the policy via `setPolicyURI`, `setAcknowledgement`, `setPolicy`, or `bumpTaxPolicyVersion`; unauthorized calls revert.
   - Describe in NatSpec and README that all tax obligations rest solely with AGI Employers, Agents, and Validators; the infrastructure bears no direct, indirect, or theoretical liability.
   - Provide step-by-step Etherscan instructions so non-technical users can view the disclaimer via `acknowledgement`/`acknowledge` and so the owner can update it with `setPolicyURI`/`setAcknowledgement`.
8. **v1 Feature Parity & ENS Identity**
   - Port every capability from `legacy/AGIJobManagerv0.sol` into dedicated v2 modules.
       - `JobRegistry`: `createJob`, `applyForJob`, `submit`, `cancelJob`, `delistJob`, `disputeJob`, `finalize`.
       - `ValidationModule`: validator selection, `commitValidation`, `revealValidation`, approval/disapproval tallies, quorum check.
       - `DisputeModule`: `raiseDispute`, moderator `resolve`, appeal-fee escrow.
       - `StakeManager`: escrow/release rewards, slashing, AGIType payout bonuses, reward & fee percentages.
       - `ReputationEngine`: logarithmic reputation growth, premium thresholds, owner‑managed blacklists.
       - `CertificateNFT`: mint completion certificates and marketplace operations (`list`, `purchase`, `delist`).
   - Map v0 functions to v2 modules to guarantee parity:

       | v0 function | v2 module / function |
       |-------------|---------------------|
       | `createJob` | `JobRegistry.createJob` |
       | `applyForJob` | `JobRegistry.applyForJob` |
       | `requestJobCompletion` | `JobRegistry.submit` |
       | `validateJob` / `disapproveJob` | `ValidationModule.commitValidation` + `revealValidation` |
       | `_completeJob` | `JobRegistry.finalize` + `StakeManager.release` + `CertificateNFT.mint` |
       | `cancelJob` / `delistJob` | `JobRegistry.cancelJob` / `delistJob` |
       | `disputeJob` | `JobRegistry.dispute` & `DisputeModule.raiseDispute` |
       | `resolveDispute` | `DisputeModule.resolve` |
       | Reputation updates | `ReputationEngine.onApply`, `onFinalize`, `rewardValidator` |

   - Enforce ENS subdomain ownership for agents (`*.agent.agi.eth`) and validators (`*.club.agi.eth`) using the Merkle proof + NameWrapper + resolver fallback sequence. Emit `OwnershipVerified` and `RecoveryInitiated` where appropriate.
       - Build a reusable `ENSOwnershipVerifier` library with `verifyOwnership(address claimant, string subdomain, bytes32[] proof, bytes32 rootNode)` mirroring v0 logic.
       - Integrate the verifier in `JobRegistry.applyForJob` and `ValidationModule.commitValidation`/`revealValidation`.
       - Provide owner setters `setAgentRootNode`, `setClubRootNode`, `setAgentMerkleRoot`, `setValidatorMerkleRoot`, `setENS`, `setNameWrapper` with events.
       - Maintain allowlists via `addAdditionalAgent/Validator` and blacklists through `ReputationEngine.blacklist`.
   - Maintain owner‑controlled allowlists (`additionalAgents`, `additionalValidators`), blacklists, and configurable root nodes and Merkle roots with corresponding events.
   - Mirror v0 administrative setters: validator thresholds, validation reward percentage, job payout and duration caps, AGI type management, terms text, and NFT marketplace controls.

## Deliverables
- Verified Solidity contracts under `contracts/v2`.
- Comprehensive test suite and lint-clean codebase.
- Updated documentation: `README.md`, `docs/architecture-v2.md` and this sprint plan.

## Definition of Done
- All tests pass.
- No linter or compile warnings.
- Module addresses and configuration steps are documented for explorer-based usage.
- Governance can adjust parameters solely through owner-restricted functions.
