# Owner Control Authority Reference (v2)

This reference distils every owner/governance surface that keeps AGI Jobs v2 under
contract-owner control. It pulls directly from the production Solidity modules so
the `OwnerConfigurator` CLI and Safe bundles always stay aligned with code.

> **How to keep this page fresh:** regenerate the matrix with
> `npm run owner:parameters -- --format markdown --out reports/<network>/owner-parameters.md`
and diff the output against this summary during reviews. The CLI uses the same
ABI metadata consumed by CI (`npm run abi:diff`), so any drift between docs and
code fails fast.

## Quick navigation

| Subsystem | Access modifier | Primary config file(s) | Update command(s) | Key setters |
| --- | --- | --- | --- | --- |
| Job Registry | `onlyGovernance` & `onlyGovernanceOrPauser` | `config/job-registry.json`, `config/identity-registry.json`, `config/fee-pool.json` | `npm run owner:update-all -- --only=jobRegistry` | `setModules`, `setIdentityRegistry`, `setAgentRootNode`, `setValidatorRootNode`, `setFeePct`, `setJobDurationLimit`, `setTaxPolicy`, `setAcknowledger`, `pause` / `unpause`【F:contracts/v2/JobRegistry.sol†L1096-L1273】 |
| Stake Manager | `onlyGovernance` | `config/stake-manager.json`, `config/fee-pool.json` | `npm run owner:update-all -- --only=stakeManager` | `setRoleMinimums`, `setMinStake`, `setSlashPercents`, `setTreasury`, `setTreasuryAllowlist`, `setModules`, `setFeePct`, `setBurnPct`, `setUnbondingPeriod`, `setMaxStakePerAddress`【F:contracts/v2/StakeManager.sol†L720-L1439】 |
| Validation Module | `onlyOwner` (governance holds ownership) | `config/validation-module.json`, `config/identity-registry.json` | `npm run owner:update-all -- --only=validationModule` | `setCommitRevealWindows`, `setValidatorBounds`, `setApprovalThreshold`, `setValidatorPool`, `setRandaoCoordinator`, `setValidatorPoolSampleSize`, `setSelectionStrategy`, `setParameters`, `pause` / `unpause`【F:contracts/v2/ValidationModule.sol†L254-L807】 |
| Fee Pool | `onlyOwner` (owned by governance Safe) | `config/fee-pool.json` | `npm run owner:update-all -- --only=feePool` | `setPauser`, `setRewarder`, `setBurnPct`, `setTreasury`, `setTreasuryAllowlist`, `setTaxPolicy`, `setGovernance`, `setStakeManager`【F:contracts/v2/FeePool.sol†L154-L441】 |
| Reward Engine MB | `onlyGovernance` | `config/reward-engine.json`, `config/thermostat.json` | `npm run owner:update-all -- --only=rewardEngine` | `setRoleShares`, `setMu`, `setBaselineEnergy`, `setKappa`, `setSettler`, `setTreasury`, `setMaxProofs`, `setThermostat`, `setTemperature`, `setFeePool`, `setReputationEngine`, `setEnergyOracle`【F:contracts/v2/RewardEngineMB.sol†L112-L227】 |
| Thermostat | `onlyGovernance` | `config/thermostat.json` | `npm run owner:update-all -- --only=thermostat` | `setPID`, `setKPIWeights`, `setSystemTemperature`, `setTemperatureBounds`, `setIntegralBounds`, `setRoleTemperature`【F:contracts/v2/Thermostat.sol†L52-L107】 |
| Energy Oracle | `onlyGovernance` | `config/energy-oracle.json` | `npm run owner:update-all -- --only=energyOracle` | `setSigner`, `setSigners` (batched)【F:contracts/v2/EnergyOracle.sol†L21-L57】 |
| System Pause | `onlyGovernance` | `config/agialpha.json` (`modules.systemPause`, plus module wiring) | `npx hardhat run scripts/v2/updateSystemPause.ts --network <network>` | `setModules`, `refreshPausers`, `pauseAll`, `unpauseAll`【F:contracts/v2/SystemPause.sol†L16-L168】 |
| Identity Registry | `onlyOwner` | `config/identity-registry.json` | `npm run owner:update-all -- --only=identityRegistry` | `setAgentRootNode`, `setAgentMerkleRoot`, `setValidatorRootNode`, `setValidatorMerkleRoot`, `setENSResolver`, `setAttestor`, `setAdditionalAgent`, `setAdditionalValidator`【F:contracts/v2/IdentityRegistry.sol†L161-L287】 |
| Dispute Module | `onlyGovernance` | `config/dispute-module.json` | `npm run owner:update-all -- --only=disputeModule` | `setCommittee`, `setArbitrator`, `setAppealWindow`, `setDisputeFee`, `setModerator`, `setJobRegistry`, `setStakeManager`【F:contracts/v2/modules/DisputeModule.sol†L73-L219】 |
| Certificate NFT | `onlyOwner` | `config/certificate-nft.json` | `npm run owner:update-all -- --only=certificateNFT` | `setBaseURI`, `setMinter`, `pause`, `unpause`【F:contracts/v2/CertificateNFT.sol†L41-L115】 |
| Hamiltonian Monitor | `onlyGovernance` | `config/hamiltonian-monitor.json` | `npm run owner:update-all -- --only=hamiltonianMonitor` | `setWindowSize`, `appendObservation`, `resetHistory`【F:contracts/v2/HamiltonianMonitor.sol†L38-L144】 |

> **Non-technical workflow:** run `npm run owner:surface -- --network <network>` to
> snapshot the current controller, diff config edits, then execute with
> `npm run owner:update-all -- --network <network> --execute`. Follow with
> `npm run owner:verify-control -- --network <network> --strict` for auditable
> confirmation.

## Verification checklist

1. **Dry-run the parameter matrix**
   ```bash
   npm run owner:parameters -- --network <network>
   ```
   Compare the emitted Markdown table with the entries above. Any difference
   signals drift between documentation and deployed contracts.
2. **Enforce CI guard rails** – the `ci (v2)` workflow regenerates ABI metadata and
   fails `npm run abi:diff` if setters change without documentation updates.
3. **Attach artefacts to change tickets** – export JSON/Markdown from
   `owner:update-all`, `owner:verify-control`, and the parameter matrix so Safe
   approvers and auditors see the exact before/after values.

Keeping this reference alongside the automated scripts guarantees the owner keeps
complete, pause-enabled control over the AGI Jobs platform.
