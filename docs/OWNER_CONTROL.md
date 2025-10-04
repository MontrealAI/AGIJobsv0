# Owner Control Matrix (Draft)

> **Status:** Draft coordination document for implementing the Owner Configurator surface area across all v2 contracts. This file enumerates the parameters that must remain owner-upgradeable and will be updated as modules are finalized.

## Overview

The AGI Jobs v2 system preserves an owner-first operating model. A single Owner address (EOA or Safe) must retain the ability to configure, pause, upgrade, and recover assets across every module. Ownership is mediated through `Ownable2Step` on all upgradeable implementations and a central `OwnerConfigurator` facade for non-technical operators.

### Operating Principles

1. **Single Source of Truth** – Every mutable parameter appears here with the contract that guards it and the emitted `ParameterUpdated` event identifier.
2. **Idempotent Batched Updates** – The configurator will expose batch setters that no-op when the requested value already matches on-chain state.
3. **Auditability** – Each change must emit `ParameterUpdated(name, oldValue, newValue, msg.sender)` and be indexed for the owner console and subgraph.
4. **Safe Compatibility** – All configuration flows will be Safe Transaction Builder compatible and surfaced in the Owner Console UI.

---

## Owner Configurator Surface

| Module | Setter | Parameter | Units / Notes |
| ------ | ------ | --------- | ------------- |
| JobRegistry | `setValidationModule(address)` | Validation module proxy | address |
| JobRegistry | `setDisputeModule(address)` | Dispute module proxy | address |
| JobRegistry | `setIdentityRegistry(address)` | Identity registry | address |
| JobRegistry | `setFeePool(address)` | Fee pool address | address |
| JobRegistry | `setTaxPolicy(address)` | Tax policy contract | address |
| JobRegistry | `setCertificateNFT(address)` | Certificate NFT contract | address |
| JobRegistry | `setRouter(address)` | Jobs router | address |
| JobRegistry | `setMaxJobDuration(uint256)` | Upper bound in seconds | uint256 |
| JobRegistry | `setMinJobReward(uint256)` | Minimum payment amount | uint256 |
| JobRegistry | `setJobCreateWhitelist(bool)` | Toggle allowlist | bool |
| JobRegistry | `setJobCreateMerkleRoot(bytes32)` | Allowlist root | bytes32 |
| ValidationModule | `setCommitWindow(uint256)` | Seconds | uint256 |
| ValidationModule | `setRevealWindow(uint256)` | Seconds | uint256 |
| ValidationModule | `setValidatorBounds(uint256,uint256)` | min,max committee | uint256 |
| ValidationModule | `setQuorum(uint16)` | Percentage (basis points) | uint16 |
| ValidationModule | `setApprovalThreshold(uint16)` | Percentage (basis points) | uint16 |
| ValidationModule | `setRandProvider(address)` | Randomness provider | address |
| ValidationModule | `setVRFParams(uint64,bytes32,uint32,uint16)` | subId,keyHash,gasLimit,confirmations | mixed |
| ValidationModule | `setNoRevealPenalty(uint16)` | Basis points | uint16 |
| ValidationModule | `setLateRevealPenalty(uint16)` | Basis points | uint16 |
| StakeManager | `setMinStake(uint8,uint256)` | Role => stake amount | uint256 |
| StakeManager | `setUnbondingPeriod(uint256)` | Seconds | uint256 |
| StakeManager | `setSlashPercents(uint16,uint16,uint16,uint16,uint16)` | bps per offense | uint16 |
| StakeManager | `setTreasury(address)` | Treasury receiver | address |
| StakeManager | `setTreasuryAllowlist(address,bool)` | Access control | address,bool |
| StakeManager | `rescueERC20(address,address,uint256)` | Token, to, amount | addresses,uint256 |
| StakeManager | `rescueETH(address,uint256)` | Recipient, amount | address,uint256 |
| IdentityRegistry | `setAgentRootNode(bytes32)` | ENS node | bytes32 |
| IdentityRegistry | `setValidatorRootNode(bytes32)` | ENS node | bytes32 |
| IdentityRegistry | `setAgentMerkleRoot(bytes32)` | Allowlist root | bytes32 |
| IdentityRegistry | `setValidatorMerkleRoot(bytes32)` | Allowlist root | bytes32 |
| IdentityRegistry | `setAttestor(address,bool)` | Attestor allowlist | address,bool |
| IdentityRegistry | `setENSResolver(address)` | ENS resolver | address |
| DisputeModule | `setDisputeFee(uint256)` | Fee amount | uint256 |
| DisputeModule | `setAppealWindow(uint256)` | Seconds | uint256 |
| DisputeModule | `setMaxRounds(uint8)` | Arbitration rounds | uint8 |
| DisputeModule | `setArbitratorCommittee(address)` | Committee contract | address |
| DisputeModule | `setModerator(address,bool)` | Moderator ACL | address,bool |
| ReputationEngine | `setWeights(uint16,uint16,uint16,uint16)` | success,fail,slash,decay | uint16 |
| ReputationEngine | `setPremiumThreshold(uint256)` | Score threshold | uint256 |
| ReputationEngine | `setBlacklist(address,bool)` | Exclusion list | address,bool |
| FeePool | `setBurnPct(uint16)` | Basis points | uint16 |
| FeePool | `setTreasury(address)` | Treasury recipient | address |
| FeePool | `setSplit(uint16,uint16,uint16,uint16,uint16)` | agents,validators,operators,employers,treasury | uint16 |
| CertificateNFT | `setBaseURI(string)` | Metadata URI | string |
| CertificateNFT | `setMinter(address)` | Authorized minter | address |
| CertificateNFT | `pause()` / `unpause()` | Circuit breaker | - |
| SystemPause | `pauseAll()` | Global stop | - |
| SystemPause | `unpauseAll()` | Resume | - |
| SystemPause | `setPauser(address)` | Emergency delegate | address |
| RandomnessWrapper | `setCoordinator(address)` | VRF coordinator | address |
| RandomnessWrapper | `setSubId(uint64)` | Subscription id | uint64 |
| RandomnessWrapper | `withdrawLINK(address,uint256)` | Rescue LINK | address,uint256 |
| NodeRegistry | `setMinSpecs(bytes32)` | Hash of requirements | bytes32 |
| NodeRegistry | `setHeartbeatWindow(uint256)` | Seconds | uint256 |
| NodeRegistry | `setTEERequired(bool)` | Toggle attestation | bool |
| NodeRegistry | `setMinNodeStake(uint256)` | Stake threshold | uint256 |
| NodeRegistry | `setOperatorFeeBps(uint16)` | Fee share | uint16 |

---

## Event Naming

All setter actions emit a canonical `ParameterUpdated(bytes32 indexed name, bytes32 indexed field, bytes oldValue, bytes newValue, address indexed actor)` event. The `name` encodes the module (e.g., `JOB_REGISTRY`) and `field` encodes the parameter (e.g., `SET_VALIDATION_MODULE`).

## Next Steps

1. Implement `contracts/admin/OwnerConfigurator.sol` with batched delegate calls to each module and per-parameter guard logic.
2. Ensure every module exposes both setter and getter pairs and adheres to `Ownable2Step`.
3. Extend Foundry/Hardhat test suites with exhaustive access control and event emission coverage (≥90% lines overall, 100% across access control paths).
4. Update Owner Console to consume this matrix for form generation and Safe transaction templates.

