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

    event GovernanceUpdated(address governance);
    event DisputeRaised(uint256 indexed jobId, address indexed claimant, bytes32 evidenceHash);
    event DisputeResolved(uint256 indexed jobId, bool employerWins);

    /// @notice Job registry that created disputes originate from.
    IJobRegistry public immutable jobRegistry;

    /// @notice External arbitration service responsible for resolving disputes.
    address public arbitrator;

    /// @dev Restrict functions to governance.
    modifier onlyGovernance() {
        require(msg.sender == governance, "only governance");
        _;
    }

    /// @dev Restrict functions to the associated JobRegistry.
    modifier onlyJobRegistry() {
        require(msg.sender == address(jobRegistry), "only registry");
        _;
    }

    /// @dev Restrict functions to the external arbitrator.
    modifier onlyArbitrator() {
        require(msg.sender == arbitrator, "only arbitrator");
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
        bytes32 evidenceHash
    ) external override onlyJobRegistry {
        require(evidenceHash != bytes32(0), "evidence");
        if (arbitrator != address(0)) {
            IArbitrationService(arbitrator).createDispute(jobId, claimant, evidenceHash);
        }
        emit DisputeRaised(jobId, claimant, evidenceHash);
    }

    /// @inheritdoc IDisputeModule
    function resolve(uint256 jobId, bool employerWins)
        external
        override
        onlyArbitrator
    {
        jobRegistry.resolveDispute(jobId, employerWins);
        emit DisputeResolved(jobId, employerWins);
    }

    // ---------------------------------------------------------------------
    // Unused legacy interfaces - maintained for compatibility
    // ---------------------------------------------------------------------

    function addModerator(address) external pure {
        revert("unsupported");
    }

    function removeModerator(address) external pure {
        revert("unsupported");
    }

    function setQuorum(uint256) external pure {
        revert("unsupported");
    }

    function getModerators() external pure returns (address[] memory) {
        return new address[](0);
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
