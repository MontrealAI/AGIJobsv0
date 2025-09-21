// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IJobRegistry} from "../interfaces/IJobRegistry.sol";
import {IDisputeModule} from "../interfaces/IDisputeModule.sol";

/// @title KlerosDisputeModule
/// @notice Minimal dispute module that forwards disputes to an external
/// arbitration service such as Kleros. The arbitrator is expected to call back
/// with the final ruling via {resolve}.
contract KlerosDisputeModule is IDisputeModule {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    /// @notice Address with permission to update module settings.
    address public governance;

    /// @dev Caller is not the configured governance address.
    error NotGovernance();
    /// @dev Caller is not the associated JobRegistry.
    error NotJobRegistry();
    /// @dev Caller is not the configured arbitrator.
    error NotArbitrator();
    /// @dev Evidence hash cannot be zero.
    error ZeroEvidence();
    /// @dev Function is not supported.
    error Unsupported();

    event GovernanceUpdated(address governance);
    event DisputeRaised(
        uint256 indexed jobId,
        address indexed claimant,
        bytes32 evidenceHash,
        string reason
    );
    event DisputeResolved(uint256 indexed jobId, bool employerWins);

    /// @notice Job registry that created disputes originate from.
    IJobRegistry public immutable jobRegistry;

    /// @notice External arbitration service responsible for resolving disputes.
    address public arbitrator;

    /// @dev Restrict functions to governance.
    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance();
        _;
    }

    /// @dev Restrict functions to the associated JobRegistry.
    modifier onlyJobRegistry() {
        if (msg.sender != address(jobRegistry)) revert NotJobRegistry();
        _;
    }

    /// @dev Restrict functions to the external arbitrator.
    modifier onlyArbitrator() {
        if (msg.sender != arbitrator) revert NotArbitrator();
        _;
    }

    /// @param _jobRegistry Address of the JobRegistry using this module.
    /// @param _arbitrator Address of the external arbitration service.
    /// @param _governance Address allowed to update governance settings.
    constructor(
        IJobRegistry _jobRegistry,
        address _arbitrator,
        address _governance
    ) {
        jobRegistry = _jobRegistry;
        arbitrator = _arbitrator;
        governance = _governance;
    }

    /// @notice Update governance address.
    function setGovernance(address _governance) external onlyGovernance {
        governance = _governance;
        emit GovernanceUpdated(_governance);
    }

    /// @notice Update the arbitration service address.
    function setArbitrator(address _arbitrator) external onlyGovernance {
        arbitrator = _arbitrator;
    }

    /// @inheritdoc IDisputeModule
    function raiseDispute(
        uint256 jobId,
        address claimant,
        bytes32 evidenceHash,
        string calldata reason
    ) external override onlyJobRegistry {
        if (evidenceHash == bytes32(0) && bytes(reason).length == 0)
            revert ZeroEvidence();
        bytes32 payload =
            evidenceHash != bytes32(0) ? evidenceHash : keccak256(bytes(reason));
        if (arbitrator != address(0)) {
            IArbitrationService(arbitrator).createDispute(jobId, claimant, payload);
        }
        emit DisputeRaised(jobId, claimant, payload, reason);
    }

    /// @inheritdoc IDisputeModule
    function resolveDispute(uint256 jobId, bool employerWins)
        public
        override
        onlyArbitrator
    {
        jobRegistry.resolveDispute(jobId, employerWins);
        emit DisputeResolved(jobId, employerWins);
    }

    /// @notice Backwards compatible alias for existing integrations.
    function resolve(uint256 jobId, bool employerWins) external onlyArbitrator {
        resolveDispute(jobId, employerWins);
    }

    /// @inheritdoc IDisputeModule
    function slashValidator(
        address,
        uint256,
        address
    ) external pure override {
        revert Unsupported();
    }

    // ---------------------------------------------------------------------
    // Unused legacy interfaces - maintained for compatibility
    // ---------------------------------------------------------------------

    function addModerator(address) external pure {
        revert Unsupported();
    }

    function removeModerator(address) external pure {
        revert Unsupported();
    }

    function setQuorum(uint256) external pure {
        revert Unsupported();
    }

    function getModerators() external pure returns (address[] memory) {
        return new address[](0);
    }

    /// @dev Reject direct ETH transfers to keep the module tax neutral.
    receive() external payable {
        revert("KlerosDisputeModule: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("KlerosDisputeModule: no ether");
    }
}

/// @dev External arbitration interface expected by the module.
interface IArbitrationService {
    function createDispute(
        uint256 jobId,
        address claimant,
        bytes32 evidenceHash
    ) external returns (uint256);
}
