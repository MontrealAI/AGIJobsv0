# Coding Sprint: AGIJobManager v2 Modular Suite

This sprint turns the v2 architecture into production-ready code. Each task references the modules and interfaces defined in `contracts/v2` and described in `docs/architecture-v2.md`.

## Sprint Goals
- Implement immutable, ownable modules for job coordination, validation, staking, reputation, disputes and certificate NFTs.
- Optimise for gas efficiency and composability while keeping explorer interactions simple for non‑technical users.
- Align incentives so honest behaviour is the dominant strategy for agents, validators and employers.

## Tasks
1. **Interface Stabilisation**
   - Finalise interfaces in `contracts/v2/interfaces`.
   - Add NatSpec comments and custom errors for clarity.
2. **Module Implementation**
   - `JobRegistry`: job lifecycle, wiring module addresses, owner configuration.
   - `ValidationModule`: pseudo‑random selection, commit‑reveal voting, outcome reporting.
   - `StakeManager`: token custody, slashing, reward release.
   - `ReputationEngine`: reputation tracking and threshold enforcement.
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

## Deliverables
- Verified Solidity contracts under `contracts/v2`.
- Comprehensive test suite and lint-clean codebase.
- Updated documentation: `README.md`, `docs/architecture-v2.md` and this sprint plan.

## Definition of Done
- All tests pass.
- No linter or compile warnings.
- Module addresses and configuration steps are documented for explorer-based usage.
- Governance can adjust parameters solely through owner-restricted functions.
