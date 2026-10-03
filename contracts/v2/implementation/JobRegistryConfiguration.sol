// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "../Governable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ITaxPolicy} from "../interfaces/ITaxPolicy.sol";
import {TaxAcknowledgement} from "../libraries/TaxAcknowledgement.sol";
import {IValidationModule} from "../interfaces/IValidationModule.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";
import {IFeePool} from "../interfaces/IFeePool.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";
import {IReputationEngine} from "../interfaces/IReputationEngine.sol";
import {IDisputeModule} from "../interfaces/IDisputeModule.sol";
import {ICertificateNFT} from "../interfaces/ICertificateNFT.sol";
import {IJobRegistryAck} from "../interfaces/IJobRegistryAck.sol";
import {IAuditModule} from "../interfaces/IAuditModule.sol";
import {TOKEN_SCALE} from "../Constants.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./JobRegistryBase.sol";
import "./FixedDelegate.sol";

/// @notice Fixed configuration implementation for JobRegistry. Deploy via the modular deployment helper.
contract JobRegistryConfiguration is JobRegistryBase, DelegateOnly {
    constructor() JobRegistryBase(msg.sender) {}

    function moduleId() external pure returns (bytes32) {
        return keccak256("JobRegistryConfiguration:v1");
    }

    function setPauser(address _pauser) external onlyDelegateCall {
        return _entry_setPauser(_pauser);
    }

    function setPauserManager(address manager) external onlyDelegateCall {
        return _entry_setPauserManager(manager);
    }

    function setModules(
        IValidationModule _validation,
        IStakeManager _stakeMgr,
        IReputationEngine _reputation,
        IDisputeModule _disputeModule,
        ICertificateNFT _certNFT,
        IFeePool _feePool,
        address[] calldata _ackModules
    ) external onlyDelegateCall {
        return _entry_setModules(_validation, _stakeMgr, _reputation, _disputeModule, _certNFT, _feePool, _ackModules);
    }

    /// @notice Update the identity registry used for agent verification.
    /// @param registry Address of the IdentityRegistry contract.
    function setIdentityRegistry(IIdentityRegistry registry) external onlyDelegateCall {
        return _entry_setIdentityRegistry(registry);
    }

    /// @notice Switch the active dispute module.
    /// @param module Address of the new dispute module contract.
    function setDisputeModule(IDisputeModule module) external onlyDelegateCall {
        return _entry_setDisputeModule(module);
    }

    /// @notice Update the validation module used to source validator lists.
    /// @param module ValidationModule contract address.
    function setValidationModule(IValidationModule module) external onlyDelegateCall {
        return _entry_setValidationModule(module);
    }

    /// @notice Update the audit module used for post-completion spot checks.
    /// @param module Address of the audit module contract (zero to disable).
    function setAuditModule(IAuditModule module) external onlyDelegateCall {
        return _entry_setAuditModule(module);
    }

    /// @notice Update the stake manager reference.
    /// @param manager StakeManager contract address.
    function setStakeManager(IStakeManager manager) external onlyDelegateCall {
        return _entry_setStakeManager(manager);
    }

    /// @notice Update the reputation engine reference.
    function setReputationEngine(IReputationEngine engine) external onlyDelegateCall {
        return _entry_setReputationEngine(engine);
    }

    /// @notice Update the certificate NFT module reference.
    function setCertificateNFT(ICertificateNFT nft) external onlyDelegateCall {
        return _entry_setCertificateNFT(nft);
    }

    /// @notice Update the ENS root node used for agent verification.
    /// @param node Namehash of the agent parent node (e.g. `agent.agi.eth`).
    function setAgentRootNode(bytes32 node) external onlyDelegateCall {
        return _entry_setAgentRootNode(node);
    }

    /// @notice Update the Merkle root for the agent allowlist.
    /// @param root Merkle root of approved agent addresses.
    function setAgentMerkleRoot(bytes32 root) external onlyDelegateCall {
        return _entry_setAgentMerkleRoot(root);
    }

    /// @notice Increment the agent authorization cache version, invalidating all
    /// existing cached authorizations.
    function bumpAgentAuthCacheVersion() public onlyDelegateCall {
        return _entry_bumpAgentAuthCacheVersion();
    }

    /// @notice Update the ENS root node used for validator verification.
    /// @param node Namehash of the validator parent node (e.g. `club.agi.eth`).
    function setValidatorRootNode(bytes32 node) external onlyDelegateCall {
        return _entry_setValidatorRootNode(node);
    }

    /// @notice Update the Merkle root for the validator allowlist.
    /// @param root Merkle root of approved validator addresses.
    function setValidatorMerkleRoot(bytes32 root) external onlyDelegateCall {
        return _entry_setValidatorMerkleRoot(root);
    }

    /// @notice Refresh or invalidate cached agent authorization entries.
    /// @param agent Address of the agent being updated.
    /// @param authorized True to refresh the cache entry, false to invalidate it.
    function updateAgentAuthCache(address agent, bool authorized) external onlyDelegateCall {
        return _entry_updateAgentAuthCache(agent, authorized);
    }

    /// @notice Update the duration for cached agent authorizations.
    /// @param duration Seconds an authorization remains valid in cache.
    function setAgentAuthCacheDuration(uint256 duration) external onlyDelegateCall {
        return _entry_setAgentAuthCacheDuration(duration);
    }

    /// @notice update the FeePool contract used for revenue sharing
    function setFeePool(IFeePool _feePool) external onlyDelegateCall {
        return _entry_setFeePool(_feePool);
    }

    /// @notice update the treasury address used for blacklisted payouts
    /// @dev Treasury must be zero (burn) or a non-owner address
    function setTreasury(address _treasury) external onlyDelegateCall {
        return _entry_setTreasury(_treasury);
    }

    /// @notice update the required agent stake for each job
    function setJobStake(uint96 stake) external onlyDelegateCall {
        return _entry_setJobStake(stake);
    }

    /// @notice update the minimum global stake required for agents when applying
    function setMinAgentStake(uint256 stake) external onlyDelegateCall {
        return _entry_setMinAgentStake(stake);
    }

    /// @notice update the percentage of each job reward taken as a protocol fee
    function setFeePct(uint256 _feePct) external onlyDelegateCall {
        return _entry_setFeePct(_feePct);
    }

    /// @notice update validator reward percentage of job reward
    function setValidatorRewardPct(uint256 pct) external onlyDelegateCall {
        return _entry_setValidatorRewardPct(pct);
    }

    /// @notice set the maximum allowed job reward
    function setMaxJobReward(uint256 maxReward) external onlyDelegateCall {
        return _entry_setMaxJobReward(maxReward);
    }

    /// @notice set the maximum allowed job duration in seconds
    function setJobDurationLimit(uint256 limit) external onlyDelegateCall {
        return _entry_setJobDurationLimit(limit);
    }

    /// @notice Set the maximum number of simultaneously active jobs an agent may hold.
    /// @dev A value of zero disables the limit.
    function setMaxActiveJobsPerAgent(uint256 limit) external onlyDelegateCall {
        return _entry_setMaxActiveJobsPerAgent(limit);
    }

    /// @notice set additional grace period after a job's deadline before it can expire
    function setExpirationGracePeriod(uint256 period) external onlyDelegateCall {
        return _entry_setExpirationGracePeriod(period);
    }

    /// @notice Sets the TaxPolicy contract holding the canonical disclaimer.
    /// @dev Only callable by the owner; the policy address cannot be zero and
    /// must explicitly report tax exemption.
    function setTaxPolicy(ITaxPolicy _policy) external onlyDelegateCall {
        return _entry_setTaxPolicy(_policy);
    }

    /// @notice Pause job lifecycle interactions
    function pause() external onlyDelegateCall {
        return _entry_pause();
    }

    /// @notice Resume job lifecycle interactions
    function unpause() external onlyDelegateCall {
        return _entry_unpause();
    }

    /// @notice Allow or revoke an acknowledger address.
    /// @dev When `allowed` is true, `acknowledger` must be a non-zero address representing a valid contract or EOA.
    /// @param acknowledger Address granted permission to acknowledge for users.
    /// @param allowed True to allow the address, false to revoke.
    function setAcknowledger(address acknowledger, bool allowed) external onlyDelegateCall {
        return _entry_setAcknowledger(acknowledger, allowed);
    }

    function setJobParameters(uint256 maxReward, uint256 stake) external onlyDelegateCall {
        return _entry_setJobParameters(maxReward, stake);
    }

    /// @notice Apply a batch of configuration updates atomically.
    /// @param config Packed configuration toggles and values to apply.
    /// @param acknowledgerUpdates Acknowledger allow/deny list updates.
    /// @param ackModules Additional acknowledge-for modules to enable.
    function applyConfiguration(
        ConfigUpdate calldata config,
        AcknowledgerUpdate[] calldata acknowledgerUpdates,
        address[] calldata ackModules
    ) external onlyDelegateCall {
        return _entry_applyConfiguration(config, acknowledgerUpdates, ackModules);
    }

    /// @notice Owner can delist an unassigned job and refund the employer.
    /// @param jobId Identifier of the job to delist.
    function delistJob(uint256 jobId) external onlyDelegateCall {
        return _entry_delistJob(jobId);
    }
}
