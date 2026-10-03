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

/// @notice Fixed lifecycle implementation for JobRegistry. Deploy via the modular deployment helper.
contract JobRegistryLifecycle is JobRegistryBase, DelegateOnly {
    constructor() JobRegistryBase(msg.sender) {}

    function moduleId() external pure returns (bytes32) {
        return keccak256("JobRegistryLifecycle:v1");
    }

    /// @notice Records evidence of a token burn by the employer.
    /// @dev Employers must acknowledge the active tax policy before calling.
    function submitBurnReceipt(uint256 jobId, bytes32 burnTxHash, uint256 amount, uint256 blockNumber)
        external
        onlyDelegateCall
    {
        return _entry_submitBurnReceipt(jobId, burnTxHash, amount, blockNumber);
    }

    /// @notice Confirms previously submitted burn evidence.
    /// @dev Employers must acknowledge the active tax policy before calling.
    function confirmEmployerBurn(uint256 jobId, bytes32 burnTxHash) external onlyDelegateCall {
        return _entry_confirmEmployerBurn(jobId, burnTxHash);
    }

    /// @notice Acknowledge the current tax policy.
    /// @dev Retrieves the acknowledgement text from the `TaxPolicy` contract
    /// and emits it for off-chain visibility so participants have an on-chain
    /// record of the exact disclaimer accepted.
    /// @return ack Human‑readable disclaimer confirming the caller bears all
    /// tax responsibility.
    function acknowledgeTaxPolicy() external onlyDelegateCall returns (string memory ack) {
        return _entry_acknowledgeTaxPolicy();
    }

    /// @notice Acknowledge the current tax policy on behalf of a user.
    /// @param user Address acknowledging the policy.
    /// @return ack Human-readable disclaimer confirming the caller bears all tax responsibility.
    function acknowledgeFor(address user) external onlyDelegateCall returns (string memory ack) {
        return _entry_acknowledgeFor(user);
    }

    function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string calldata uri)
        external
        onlyDelegateCall
        returns (uint256 jobId)
    {
        return _entry_createJob(reward, deadline, specHash, uri);
    }

    function createJobWithAgentTypes(
        uint256 reward,
        uint64 deadline,
        uint8 agentTypes,
        bytes32 specHash,
        string calldata uri
    ) external onlyDelegateCall returns (uint256 jobId) {
        return _entry_createJobWithAgentTypes(reward, deadline, agentTypes, specHash, uri);
    }

    /**
     * @notice Acknowledge the tax policy and create a job in one transaction.
     * @dev `reward` uses 18-decimal base units. Caller must `approve` the
     *      StakeManager for `reward + fee` $AGIALPHA before calling.
     * @param reward Job reward in $AGIALPHA with 18 decimals.
     * @param uri Metadata URI describing the job.
     * @return jobId Identifier of the newly created job.
     */
    function acknowledgeAndCreateJob(uint256 reward, uint64 deadline, bytes32 specHash, string calldata uri)
        external
        onlyDelegateCall
        returns (uint256 jobId)
    {
        return _entry_acknowledgeAndCreateJob(reward, deadline, specHash, uri);
    }

    function acknowledgeAndCreateJobWithAgentTypes(
        uint256 reward,
        uint64 deadline,
        uint8 agentTypes,
        bytes32 specHash,
        string calldata uri
    ) external onlyDelegateCall returns (uint256 jobId) {
        return _entry_acknowledgeAndCreateJobWithAgentTypes(reward, deadline, agentTypes, specHash, uri);
    }

    function applyForJob(uint256 jobId, string calldata subdomain, bytes32[] calldata proof) external onlyDelegateCall {
        return _entry_applyForJob(jobId, subdomain, proof);
    }

    /**
     * @notice Acknowledge the current tax policy and apply for a job.
     * @dev No tokens are transferred. Job reward and stake amounts elsewhere
     *      use 18-decimal $AGIALPHA units. Any stake deposits require prior
     *      `approve` calls on the $AGIALPHA token via the `StakeManager`.
     * @param jobId Identifier of the job to apply for.
     */
    function acknowledgeAndApply(uint256 jobId, string calldata subdomain, bytes32[] calldata proof)
        external
        onlyDelegateCall
    {
        return _entry_acknowledgeAndApply(jobId, subdomain, proof);
    }

    /**
     * @notice Deposit stake, implicitly acknowledge the tax policy if needed,
     *         and apply for a job in a single call.
     * @dev `amount` uses 18-decimal base units. Caller must `approve` the
     *      `StakeManager` to pull `amount` $AGIALPHA beforehand. If the caller
     *      has not yet acknowledged the tax policy, this helper will do so
     *      automatically on their behalf.
     * @param jobId Identifier of the job to apply for.
     * @param amount Stake amount in $AGIALPHA with 18 decimals.
     */
    function stakeAndApply(uint256 jobId, uint256 amount, string calldata subdomain, bytes32[] calldata proof)
        external
        onlyDelegateCall
    {
        return _entry_stakeAndApply(jobId, amount, subdomain, proof);
    }

    /// @notice Agent submits work for validation and selects validators.
    /// @param jobId Identifier of the job being submitted.
    /// @param resultHash Hash of the completed work.
    /// @param resultURI Metadata URI describing the completed work.
    function submit(
        uint256 jobId,
        bytes32 resultHash,
        string calldata resultURI,
        string calldata subdomain,
        bytes32[] calldata proof
    ) public onlyDelegateCall {
        return _entry_submit(jobId, resultHash, resultURI, subdomain, proof);
    }

    /// @notice Acknowledge the tax policy and submit work in one call.
    function acknowledgeAndSubmit(
        uint256 jobId,
        bytes32 resultHash,
        string calldata resultURI,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external onlyDelegateCall {
        return _entry_acknowledgeAndSubmit(jobId, resultHash, resultURI, subdomain, proof);
    }

    /// @notice Record that reputation updates have already been applied for a job.
    /// @param jobId Identifier of the job that triggered the update.
    function markReputationProcessed(uint256 jobId) external onlyDelegateCall {
        return _entry_markReputationProcessed(jobId);
    }

    /// @notice Receive validation outcome from the ValidationModule
    /// @param jobId Identifier of the job
    /// @param success True if validators approved the job
    /// @param validators Validators that participated in validation
    function onValidationResult(uint256 jobId, bool success, address[] calldata validators) external onlyDelegateCall {
        return _entry_onValidationResult(jobId, success, validators);
    }
}
