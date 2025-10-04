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
| JobRegistry | `setPauser(address)` | Pauser delegate | Emits `PauserUpdated`. |
| JobRegistry | `setModules(IValidationModule,IStakeManager,IReputationEngine,IDisputeModule,ICertificateNFT,IFeePool,address[])` | Core module bundle & acknowledge-for helpers | Emits per-module `...Updated`, paired `ModuleUpdated`, and `AcknowledgerUpdated` for the stake manager and each ack module. |
| JobRegistry | `setIdentityRegistry(IIdentityRegistry)` | Identity registry | Emits `IdentityRegistryUpdated` + `ModuleUpdated`. |
| JobRegistry | `setDisputeModule(IDisputeModule)` | Dispute module proxy | Emits `DisputeModuleUpdated` + `ModuleUpdated`. |
| JobRegistry | `setValidationModule(IValidationModule)` | Validation module proxy | Emits `ValidationModuleUpdated` + `ModuleUpdated`. |
| JobRegistry | `setAuditModule(IAuditModule)` | Audit module proxy (zero to disable) | Emits `AuditModuleUpdated` + `ModuleUpdated`. |
| JobRegistry | `setStakeManager(IStakeManager)` | Stake manager | Emits `StakeManagerUpdated`, `ModuleUpdated`, and `AcknowledgerUpdated`. |
| JobRegistry | `setReputationEngine(IReputationEngine)` | Reputation engine | Emits `ReputationEngineUpdated` + `ModuleUpdated`. |
| JobRegistry | `setCertificateNFT(ICertificateNFT)` | Certificate NFT contract | Emits `CertificateNFTUpdated` + `ModuleUpdated`. |
| JobRegistry | `setFeePool(IFeePool)` | Fee pool address | Emits `FeePoolUpdated` + `ModuleUpdated`. |
| JobRegistry | `setTaxPolicy(ITaxPolicy)` | Tax policy contract | Emits `TaxPolicyUpdated` + `ModuleUpdated`. |
| JobRegistry | `setTreasury(address)` | Treasury receiver | Emits `TreasuryUpdated`. |
| JobRegistry | `setAgentRootNode(bytes32)` | ENS root for agents | Emits `AgentRootNodeUpdated`. |
| JobRegistry | `setAgentMerkleRoot(bytes32)` | Agent allowlist root | Emits `AgentMerkleRootUpdated`. |
| JobRegistry | `setValidatorRootNode(bytes32)` | ENS root for validators | Emits `ValidatorRootNodeUpdated`. |
| JobRegistry | `setValidatorMerkleRoot(bytes32)` | Validator allowlist root | Emits `ValidatorMerkleRootUpdated`. |
| JobRegistry | `setAgentAuthCacheDuration(uint256)` | Authorization cache seconds | Emits `AgentAuthCacheDurationUpdated`. |
| JobRegistry | `bumpAgentAuthCacheVersion()` | Invalidate cached agent authorizations | Emits `AgentAuthCacheVersionBumped`. |
| JobRegistry | `updateAgentAuthCache(address,bool)` | Refresh a cached agent authorization | Emits `AgentAuthCacheUpdated`. |
| JobRegistry | `setJobStake(uint96)` | Required stake per job | Emits `JobParametersUpdated`. |
| JobRegistry | `setMinAgentStake(uint256)` | Global agent stake floor | Emits `JobParametersUpdated`. |
| JobRegistry | `setMaxJobReward(uint256)` | Maximum job payment | Emits `JobParametersUpdated`. |
| JobRegistry | `setJobDurationLimit(uint256)` | Maximum job duration (seconds) | Emits `JobParametersUpdated`. |
| JobRegistry | `setJobParameters(uint256,uint256)` | Batch max reward + stake | Emits `JobParametersUpdated` twice (stake then max reward). |
| JobRegistry | `setFeePct(uint256)` | Protocol fee percentage | Emits `FeePctUpdated`. |
| JobRegistry | `setValidatorRewardPct(uint256)` | Validator share of job reward | Emits `ValidatorRewardPctUpdated`. |
| JobRegistry | `setMaxActiveJobsPerAgent(uint256)` | Concurrent job cap | Emits `MaxActiveJobsPerAgentUpdated`. |
| JobRegistry | `setExpirationGracePeriod(uint256)` | Additional grace after deadline (seconds) | Emits `ExpirationGracePeriodUpdated`. |
| JobRegistry | `setAcknowledger(address,bool)` | Allow/deny acknowledge-for helpers | Emits `AcknowledgerUpdated`. |
| ValidationModule | `setPauser(address)` | Pauser delegate | Emits `PauserUpdated`. |
| ValidationModule | `setReputationEngine(IReputationEngine)` | Reputation engine | Emits `ReputationEngineUpdated`. |
| ValidationModule | `setJobRegistry(IJobRegistry)` | Job registry proxy | Emits `JobRegistryUpdated` + `ModulesUpdated`. |
| ValidationModule | `setStakeManager(IStakeManager)` | Stake manager proxy | Emits `StakeManagerUpdated` + `ModulesUpdated`. |
| ValidationModule | `setIdentityRegistry(IIdentityRegistry)` | Identity registry | Emits `IdentityRegistryUpdated`. |
| ValidationModule | `setRandaoCoordinator(IRandaoCoordinator)` | Randomness coordinator | Emits `RandaoCoordinatorUpdated`. |
| ValidationModule | `setNonRevealPenalty(uint256,uint256)` | Penalty bps & ban blocks | Emits `NonRevealPenaltyUpdated`. |
| ValidationModule | `setRevealQuorum(uint256,uint256)` | Reveal quorum %, min validators | Emits `RevealQuorumUpdated`. |
| ValidationModule | `setEarlyFinalizeDelay(uint256)` | Early finalize cooldown (seconds) | Emits `EarlyFinalizeDelayUpdated`. |
| ValidationModule | `setForceFinalizeGrace(uint256)` | Force finalize grace (seconds) | Emits `ForceFinalizeGraceUpdated`. |
| ValidationModule | `setValidatorBounds(uint256,uint256)` | Min/max validator committee | Emits `ValidatorBoundsUpdated` and may emit `ValidatorsPerJobUpdated`. |
| ValidationModule | `setValidatorsPerJob(uint256)` | Committee size | Emits `ValidatorsPerJobUpdated`. |
| ValidationModule | `setMaxValidatorsPerJob(uint256)` | Hard cap per job | Emits `MaxValidatorsPerJobUpdated` and may emit `ValidatorBoundsUpdated`/`ValidatorsPerJobUpdated`. |
| ValidationModule | `setCommitWindow(uint256)` | Commit window (seconds) | Emits `TimingUpdated` + `CommitWindowUpdated`. |
| ValidationModule | `setRevealWindow(uint256)` | Reveal window (seconds) | Emits `TimingUpdated` + `RevealWindowUpdated`. |
| ValidationModule | `setMinValidators(uint256)` | Committee minimum | Emits `ValidatorBoundsUpdated`. |
| ValidationModule | `setMaxValidators(uint256)` | Committee maximum | Emits `ValidatorBoundsUpdated`. |
| ValidationModule | `setValidatorSlashingPct(uint256)` | Slashing share for validators | Emits `ValidatorSlashingPctUpdated`. |
| ValidationModule | `setApprovalThreshold(uint256)` | Approval threshold (%) | Emits `ApprovalThresholdUpdated` and re-syncs `RequiredValidatorApprovalsUpdated` when auto targeting. |
| ValidationModule | `setRequiredValidatorApprovals(uint256)` | Absolute approval count | Emits `RequiredValidatorApprovalsUpdated` (and `AutoApprovalTargetUpdated(false)` when disabling auto targeting). |
| ValidationModule | `setAutoApprovalTarget(bool)` | Toggle auto-approval | Emits `AutoApprovalTargetUpdated`. |
| ValidationModule | `setValidatorPoolSampleSize(uint256)` | Sample size | Emits `ValidatorPoolSampleSizeUpdated`. |
| ValidationModule | `setMaxValidatorPoolSize(uint256)` | Pool cap | Emits `MaxValidatorPoolSizeUpdated`. |
| ValidationModule | `setSelectionStrategy(IValidationModule.SelectionStrategy)` | Committee selection strategy | Emits `SelectionStrategyUpdated`. |
| ValidationModule | `setValidatorAuthCacheDuration(uint256)` | Cache duration (seconds) | Emits `ValidatorAuthCacheDurationUpdated`. |
| ValidationModule | `bumpValidatorAuthCacheVersion()` | Invalidate cached validator authorizations | Emits `ValidatorAuthCacheVersionBumped`. |
| StakeManager | `setPauser(address)` | Pauser delegate | Emits `PauserUpdated`. |
| StakeManager | `setThermostat(address)` | Dispute-rate thermostat feed | Emits `ThermostatUpdated`. |
| StakeManager | `setHamiltonianFeed(address)` | Hamiltonian feed | Emits `HamiltonianFeedUpdated`. |
| StakeManager | `autoTuneStakes(bool)` | Toggle auto-tuning | Emits `AutoStakeTuningEnabled`. |
| StakeManager | `setMinStake(uint256)` | Global minimum stake | Emits `MinStakeUpdated`. |
| StakeManager | `setRoleMinimum(Role,uint256)` | Role-specific minimums | Emits `RoleMinimumUpdated`. |
| StakeManager | `setSlashingDistribution(uint256,uint256,uint256,uint256)` | Employer/treasury/operator/validator percentages | Emits `SlashingPercentagesUpdated`, `OperatorSlashPctUpdated`, `ValidatorSlashRewardPctUpdated`, and `SlashDistributionUpdated`. |
| StakeManager | `setTreasury(address)` | Treasury receiver | Emits `TreasuryUpdated`. |
| StakeManager | `setTreasuryAllowlist(address,bool)` | Treasury ACL | Emits `TreasuryAllowlistUpdated`. |
| StakeManager | `setJobRegistry(address)` | Job registry proxy | Emits `JobRegistryUpdated` + `ModulesUpdated`. |
| StakeManager | `setDisputeModule(address)` | Dispute module proxy | Emits `DisputeModuleUpdated` + `ModulesUpdated`. |
| StakeManager | `setValidationModule(address)` | Validation module proxy | Emits `ValidationModuleUpdated`. |
| StakeManager | `setModules(address,address)` | Batch job/dispute module wiring | Emits `JobRegistryUpdated`, `DisputeModuleUpdated`, + `ModulesUpdated`. |
| StakeManager | `setValidatorLockManager(address,bool)` | Validator lock manager ACL | Emits `ValidatorLockManagerUpdated`. |
| StakeManager | `setFeePct(uint256)` | Protocol fee % on stakes | Emits `FeePctUpdated`. |
| StakeManager | `setFeePool(IFeePool)` | FeePool address | Emits `FeePoolUpdated`. |
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
| DisputeModule | `setJobRegistry(IJobRegistry)` | Job registry proxy | Emits `JobRegistryUpdated` + `ModulesUpdated`. |
| DisputeModule | `setStakeManager(IStakeManager)` | Stake manager proxy | Emits `StakeManagerUpdated` + `ModulesUpdated`. |
| DisputeModule | `setCommittee(address)` | Arbitration committee | Emits `CommitteeUpdated`. |
| DisputeModule | `setTaxPolicy(ITaxPolicy)` | Tax policy | Emits `TaxPolicyUpdated`. |
| DisputeModule | `setDisputeFee(uint256)` | Fee amount (18 decimals) | Emits `DisputeFeeUpdated`. |
| DisputeModule | `setDisputeWindow(uint256)` | Resolution window (seconds) | Emits `DisputeWindowUpdated`. |
| DisputeModule | `setModerator(address,uint96)` | Moderator weight | Emits `ModeratorUpdated`. |
| DisputeModule | `setPauser(address)` | Emergency delegate | Emits `PauserUpdated`. |
| ReputationEngine | `setPauser(address)` | Pauser delegate | Emits `PauserUpdated`. |
| ReputationEngine | `setCaller(address,bool)` | Legacy/alias setter for authorized callers | Emits `CallerUpdated`. |
| ReputationEngine | `setStakeManager(IStakeManager)` | Stake manager proxy | Emits `StakeManagerUpdated` + `ModulesUpdated`. |
| ReputationEngine | `setScoringWeights(uint256,uint256)` | Stake & reputation weights | Emits `ScoringWeightsUpdated`. |
| ReputationEngine | `setValidationRewardPercentage(uint256)` | Reward % | Emits `ValidationRewardPercentageUpdated`. |
| ReputationEngine | `setPremiumThreshold(uint256)` | Score threshold | Emits `PremiumThresholdUpdated`. |
| ReputationEngine | `setBlacklist(address,bool)` | Exclusion list | Emits `BlacklistUpdated`. |
| FeePool | `setPauser(address)` | Pauser delegate | Emits `PauserUpdated`. |
| FeePool | `setStakeManager(IStakeManager)` | Stake manager proxy | Emits `StakeManagerUpdated` + `ModulesUpdated`. |
| FeePool | `setRewardRole(IStakeManager.Role)` | Reward bucket role | Emits `RewardRoleUpdated`. |
| FeePool | `setBurnPct(uint256)` | Burn percentage | Emits `BurnPctUpdated`. |
| FeePool | `setTreasury(address)` | Treasury recipient | Emits `TreasuryUpdated`. |
| FeePool | `setTreasuryAllowlist(address,bool)` | Treasury ACL | Emits `TreasuryAllowlistUpdated`. |
| FeePool | `setRewarder(address,bool)` | Rewarder ACL | Emits `RewarderUpdated`. |
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

