# Coding Sprint: AGIJobManager v2 Modular Suite

This sprint turns the v2 architecture into production-ready code. Each task references the modules and interfaces defined in `contracts/v2` and described in `docs/architecture-v2.md`.

## Sprint Goals
- Implement immutable, ownable modules for job coordination, validation, staking, reputation, disputes and certificate NFTs.
- Optimise for gas efficiency and composability while keeping explorer interactions simple for non‑technical users.
- Align incentives so honest behaviour is the dominant strategy for agents, validators and employers.
- Publish an on-chain tax disclaimer that leaves all liabilities with employers, agents and validators while the owner remains exempt.

## Tasks
1. **Interface Stabilisation**
   - Finalise interfaces in `contracts/v2/interfaces`.
   - Add NatSpec comments and custom errors for clarity.
2. **Module Implementation**
   - `JobRegistry`: job lifecycle, wiring module addresses, owner configuration.
   - `ValidationModule`: pseudo‑random selection, commit‑reveal voting, outcome reporting.
   - `StakeManager`: token custody, slashing, reward release; defaults to $AGI at `0xf0780F43b86c13B3d0681B1Cf6DaeB1499e7f14D` and exposes `setToken` for owner swaps.
   - `ReputationEngine`: reputation tracking, threshold enforcement, owner-managed blacklist.
   - `DisputeModule`: optional appeal flow and final ruling.
   - `CertificateNFT`: ERC‑721 minting with owner‑settable base URI.
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
7. **Tax Responsibility & Owner Neutrality**
   - Ensure no module ever routes tokens or fees to the owner; the contracts and deploying corporation must remain revenue-free and tax-exempt worldwide.
   - Require participants to call `acknowledgeTaxPolicy` before interacting with `JobRegistry`, tracking acknowledgements per address.
   - Wire the owner-controlled `TaxPolicy` into `JobRegistry` and surface `taxPolicyDetails()` so explorers can display the canonical acknowledgement and policy URI.
   - Guarantee only the owner can update the policy via `setPolicyURI`, `setAcknowledgement`, `setPolicy`, or `bumpTaxPolicyVersion`; unauthorized calls revert.
   - Describe in NatSpec and README that all tax obligations rest solely with AGI Employers, Agents, and Validators; the infrastructure bears no direct, indirect, or theoretical liability.
   - Provide step-by-step Etherscan instructions so non-technical users can view the disclaimer via `acknowledgement`/`acknowledge` and so the owner can update it with `setPolicyURI`/`setAcknowledgement`.

## Deliverables
- Verified Solidity contracts under `contracts/v2`.
- Comprehensive test suite and lint-clean codebase.
- Updated documentation: `README.md`, `docs/architecture-v2.md` and this sprint plan.

## Definition of Done
- All tests pass.
- No linter or compile warnings.
- Module addresses and configuration steps are documented for explorer-based usage.
- Governance can adjust parameters solely through owner-restricted functions.
