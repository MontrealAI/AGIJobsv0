# Owner Control Matrix

> **Status:** Reflects the live owner/governance surface for the deployed v2 modules. Update this matrix whenever a setter or emitted event signature changes in `contracts/v2/*`.

## Overview

The AGI Jobs v2 system preserves an owner-first operating model. A single Owner address (EOA or Safe) must retain the ability to configure, pause, upgrade, and recover assets across every module. Ownership is mediated through `Ownable2Step` on all upgradeable implementations and a central `OwnerConfigurator` facade for non-technical operators.

### Operating Principles

1. **Single Source of Truth** – Every mutable parameter appears here with the contract that guards it and the module-specific event(s) emitted on update.
2. **Idempotent Batched Updates** – The configurator will expose batch setters that no-op when the requested value already matches on-chain state.
3. **Auditability** – Each change must emit the concrete `...Updated` event(s) listed here and be indexed for the owner console and subgraph.
4. **Safe Compatibility** – All configuration flows will be Safe Transaction Builder compatible and surfaced in the Owner Console UI.

---

## Owner Configurator Surface

| Module | Setter | Parameter | Units / Notes |
| ------ | ------ | --------- | ------------- |
| JobRegistry | `setValidationModule(IValidationModule)` | Validation module proxy | Emits `ValidationModuleUpdated` + `ModuleUpdated`. |
| JobRegistry | `setDisputeModule(IDisputeModule)` | Dispute module proxy | Emits `DisputeModuleUpdated` + `ModuleUpdated`. |
| JobRegistry | `setIdentityRegistry(IIdentityRegistry)` | Identity registry | Emits `IdentityRegistryUpdated` + `ModuleUpdated`. |
| JobRegistry | `setStakeManager(IStakeManager)` | Stake manager | Emits `StakeManagerUpdated` + `ModuleUpdated`. |
| JobRegistry | `setReputationEngine(IReputationEngine)` | Reputation engine | Emits `ReputationEngineUpdated` + `ModuleUpdated`. |
| JobRegistry | `setCertificateNFT(ICertificateNFT)` | Certificate NFT contract | Emits `CertificateNFTUpdated` + `ModuleUpdated`. |
| JobRegistry | `setFeePool(IFeePool)` | Fee pool address | Emits `FeePoolUpdated` + `ModuleUpdated`. |
| JobRegistry | `setTaxPolicy(ITaxPolicy)` | Tax policy contract | Emits `TaxPolicyUpdated` + `ModuleUpdated`. |
| JobRegistry | `setTreasury(address)` | Treasury receiver | Emits `TreasuryUpdated`. |
| JobRegistry | `setJobStake(uint96)` | Required stake per job | Emits `JobParametersUpdated`. |
| JobRegistry | `setMinAgentStake(uint256)` | Global agent stake floor | Emits `JobParametersUpdated`. |
| JobRegistry | `setFeePct(uint256)` | Protocol fee percentage | Emits `FeePctUpdated`. |
| JobRegistry | `setValidatorRewardPct(uint256)` | Validator share of job reward | Emits `ValidatorRewardPctUpdated`. |
| JobRegistry | `setMaxJobReward(uint256)` | Maximum job payment | Emits `JobParametersUpdated`. |
| JobRegistry | `setJobDurationLimit(uint256)` | Maximum job duration (seconds) | Emits `JobParametersUpdated`. |
| JobRegistry | `setMaxActiveJobsPerAgent(uint256)` | Concurrent job cap | Emits `MaxActiveJobsPerAgentUpdated`. |
| JobRegistry | `setAgentRootNode(bytes32)` | ENS root for agents | Emits `AgentRootNodeUpdated`. |
| JobRegistry | `setAgentMerkleRoot(bytes32)` | Agent allowlist root | Emits `AgentMerkleRootUpdated`. |
| JobRegistry | `setValidatorRootNode(bytes32)` | ENS root for validators | Emits `ValidatorRootNodeUpdated`. |
| JobRegistry | `setValidatorMerkleRoot(bytes32)` | Validator allowlist root | Emits `ValidatorMerkleRootUpdated`. |
| JobRegistry | `setAgentAuthCacheDuration(uint256)` | Authorization cache seconds | Emits `AgentAuthCacheDurationUpdated`. |
| ValidationModule | `setCommitWindow(uint256)` | Commit window (seconds) | Emits `CommitWindowUpdated`. |
| ValidationModule | `setRevealWindow(uint256)` | Reveal window (seconds) | Emits `RevealWindowUpdated`. |
| ValidationModule | `setValidatorBounds(uint256,uint256)` | Min/max validator committee | Emits `ValidatorBoundsUpdated`. |
| ValidationModule | `setRevealQuorum(uint256,uint256)` | Reveal quorum %, min validators | Emits `RevealQuorumUpdated`. |
| ValidationModule | `setApprovalThreshold(uint256)` | Approval threshold (%) | Emits `ApprovalThresholdUpdated`. |
| ValidationModule | `setNonRevealPenalty(uint256,uint256)` | Penalty bps & ban blocks | Emits `NonRevealPenaltyUpdated`. |
| ValidationModule | `setValidatorSlashingPct(uint256)` | Slashing share for validators | Emits `ValidatorSlashingPctUpdated`. |
| ValidationModule | `setRandaoCoordinator(IRandaoCoordinator)` | Randomness coordinator | Emits `RandaoCoordinatorUpdated`. |
| ValidationModule | `setValidatorPoolSampleSize(uint256)` | Sample size | Emits `ValidatorPoolSampleSizeUpdated`. |
| ValidationModule | `setMaxValidatorPoolSize(uint256)` | Pool cap | Emits `MaxValidatorPoolSizeUpdated`. |
| ValidationModule | `setValidatorAuthCacheDuration(uint256)` | Cache duration (seconds) | Emits `ValidatorAuthCacheDurationUpdated`. |
| ValidationModule | `setAutoApprovalTarget(bool)` | Toggle auto-approval | Emits `AutoApprovalTargetUpdated`. |
| StakeManager | `setMinStake(uint256)` | Global minimum stake | Emits `MinStakeUpdated`. |
| StakeManager | `setRoleMinimum(Role,uint256)` | Role-specific minimums | Emits `RoleMinimumUpdated`. |
| StakeManager | `setSlashDistribution(uint256,uint256,uint256,uint256)` | Employer/treasury/operator/validator percentages | Emits `SlashDistributionUpdated` alongside component events. |
| StakeManager | `setTreasury(address)` | Treasury receiver | Emits `TreasuryUpdated`. |
| StakeManager | `setTreasuryAllowlist(address,bool)` | Treasury ACL | Emits `TreasuryAllowlistUpdated`. |
| StakeManager | `setFeePct(uint256)` | Protocol fee % on stakes | Emits `FeePctUpdated`. |
| StakeManager | `setBurnPct(uint256)` | Burn % | Emits `BurnPctUpdated`. |
| StakeManager | `setValidatorRewardPct(uint256)` | Validator reward % | Emits `ValidatorRewardPctUpdated`. |
| StakeManager | `setUnbondingPeriod(uint256)` | Unbonding delay (seconds) | Emits `UnbondingPeriodUpdated`. |
| StakeManager | `setMaxStakePerAddress(uint256)` | Stake cap per address | Emits `MaxStakePerAddressUpdated`. |
| IdentityRegistry | `setENS(address)` | ENS registry | Emits `ENSUpdated`. |
| IdentityRegistry | `setNameWrapper(address)` | ENS name wrapper | Emits `NameWrapperUpdated`. |
| IdentityRegistry | `setReputationEngine(address)` | Reputation engine | Emits `ReputationEngineUpdated`. |
| IdentityRegistry | `setAttestationRegistry(address)` | Attestation registry | Emits `AttestationRegistryUpdated`. |
| IdentityRegistry | `setAgentRootNode(bytes32)` | Agent ENS node | Emits `AgentRootNodeUpdated`. |
| IdentityRegistry | `setClubRootNode(bytes32)` | Validator ENS node | Emits `ClubRootNodeUpdated`. |
| IdentityRegistry | `setNodeRootNode(bytes32)` | Node operator ENS node | Emits `NodeRootNodeUpdated`. |
| IdentityRegistry | `setAgentMerkleRoot(bytes32)` | Agent allowlist root | Emits `AgentMerkleRootUpdated`. |
| IdentityRegistry | `setValidatorMerkleRoot(bytes32)` | Validator allowlist root | Emits `ValidatorMerkleRootUpdated`. |
| DisputeModule | `setDisputeFee(uint256)` | Fee amount (18 decimals) | Emits `DisputeFeeUpdated`. |
| DisputeModule | `setDisputeWindow(uint256)` | Resolution window (seconds) | Emits `DisputeWindowUpdated`. |
| DisputeModule | `setCommittee(address)` | Arbitration committee | Emits `CommitteeUpdated`. |
| DisputeModule | `setTaxPolicy(ITaxPolicy)` | Tax policy | Emits `TaxPolicyUpdated`. |
| DisputeModule | `setModerator(address,uint96)` | Moderator weight | Emits `ModeratorUpdated`. |
| DisputeModule | `setPauser(address)` | Emergency delegate | Emits `PauserUpdated`. |
| ReputationEngine | `setScoringWeights(uint256,uint256)` | Stake & reputation weights | Emits `ScoringWeightsUpdated`. |
| ReputationEngine | `setValidationRewardPercentage(uint256)` | Reward % | Emits `ValidationRewardPercentageUpdated`. |
| ReputationEngine | `setPremiumThreshold(uint256)` | Score threshold | Emits `PremiumThresholdUpdated`. |
| ReputationEngine | `setBlacklist(address,bool)` | Exclusion list | Emits `BlacklistUpdated`. |
| FeePool | `setBurnPct(uint256)` | Burn percentage | Emits `BurnPctUpdated`. |
| FeePool | `setTreasury(address)` | Treasury recipient | Emits `TreasuryUpdated`. |
| FeePool | `setTreasuryAllowlist(address,bool)` | Treasury ACL | Emits `TreasuryAllowlistUpdated`. |
| FeePool | `setRewardRole(IStakeManager.Role)` | Reward bucket role | Emits `RewardRoleUpdated`. |
| FeePool | `setTaxPolicy(ITaxPolicy)` | Tax policy | Emits `TaxPolicyUpdated`. |
| CertificateNFT | `setJobRegistry(address)` | Job registry | Emits `JobRegistryUpdated`. |
| CertificateNFT | `setStakeManager(address)` | Stake manager | Emits `StakeManagerUpdated`. |
| CertificateNFT | `setBaseURI(string)` | Metadata base URI | Emits `BaseURIUpdated`. |
| SystemPause | `setModules(JobRegistry,StakeManager,ValidationModule,DisputeModule,PlatformRegistry,FeePool,ReputationEngine,ArbitratorCommittee)` | Managed modules | Emits `ModulesUpdated`. |
| SystemPause | `pauseAll()` | Global stop | Emits module-level `Paused` events. |
| SystemPause | `unpauseAll()` | Resume | Emits module-level `Unpaused` events. |
| RandaoCoordinator | `setCommitWindow(uint256)` | Commit window (seconds) | Emits `CommitWindowUpdated`. |
| RandaoCoordinator | `setRevealWindow(uint256)` | Reveal window (seconds) | Emits `RevealWindowUpdated`. |
| RandaoCoordinator | `setDeposit(uint256)` | Coordinator deposit | Emits `DepositUpdated`. |
| RandaoCoordinator | `setTreasury(address)` | Treasury recipient | Emits `TreasuryUpdated`. |
| RandaoCoordinator | `setToken(address)` | Payment token | Emits `TokenUpdated`. |

---

## Event Naming

Each setter emits the module-specific `...Updated` events referenced in the matrix above. Consumers should subscribe to those concrete events (and any paired aggregate events such as `ModuleUpdated`) instead of assuming a single shared `ParameterUpdated` schema.

## Next Steps

1. Implement `contracts/admin/OwnerConfigurator.sol` with batched delegate calls to each module and per-parameter guard logic.
2. Ensure every module exposes both setter and getter pairs and adheres to `Ownable2Step`.
3. Extend Foundry/Hardhat test suites with exhaustive access control and event emission coverage (≥90% lines overall, 100% across access control paths).
4. Update Owner Console to consume this matrix for form generation and Safe transaction templates.

