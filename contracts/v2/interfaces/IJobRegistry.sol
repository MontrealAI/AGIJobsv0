// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IJobRegistry
/// @notice Interface for orchestrating job lifecycles and module coordination
import {IValidationModule} from "./IValidationModule.sol";
import {IStakeManager} from "./IStakeManager.sol";
import {IReputationEngine} from "./IReputationEngine.sol";
import {IDisputeModule} from "./IDisputeModule.sol";
import {ICertificateNFT} from "./ICertificateNFT.sol";

interface IJobRegistry {
    enum State {
        None,
        Created,
        Applied,
        Completed,
        Disputed,
        Finalized,
        Cancelled
    }

    struct Job {
        address employer;
        address agent;
        uint128 reward;
        uint96 stake;
        State state;
        bool success;
    }

    // module configuration
    event ValidationModuleUpdated(address module);
    event ReputationEngineUpdated(address engine);
    event StakeManagerUpdated(address manager);
    event CertificateNFTUpdated(address nft);
    event DisputeModuleUpdated(address module);

    // job lifecycle
    event JobCreated(
        uint256 indexed jobId,
        address indexed employer,
        address indexed agent,
        uint256 reward,
        uint256 stake
    );
    event AgentApplied(uint256 indexed jobId, address indexed agent);
    event JobSubmitted(uint256 indexed jobId, bool success);
    event JobFinalized(uint256 indexed jobId, bool success);
    event JobParametersUpdated(uint256 reward, uint256 stake);

    // owner wiring of modules
    function setModules(
        IValidationModule validation,
        IStakeManager stakeManager,
        IReputationEngine reputation,
        IDisputeModule dispute,
        ICertificateNFT certNFT
    ) external;

    /// @notice Owner configuration of job limits
    function setJobParameters(uint256 reward, uint256 stake) external;

    // core job flow
    function createJob() external returns (uint256 jobId);
    function applyForJob(uint256 jobId) external;
    function submit(uint256 jobId) external;
    function dispute(uint256 jobId) external payable;
    function resolveDispute(uint256 jobId, bool employerWins) external;
    function finalize(uint256 jobId) external;
    function cancelJob(uint256 jobId) external;

    // view helper
    function jobs(uint256 jobId) external view returns (Job memory);
}
