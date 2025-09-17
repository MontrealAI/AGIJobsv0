// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IJobRegistry} from "../interfaces/IJobRegistry.sol";
import {IValidationModule} from "../interfaces/IValidationModule.sol";

/// @dev Minimal interface for external oracle decisions.
interface IValidationOracle {
    function approve(uint256 jobId, string calldata data)
        external
        view
        returns (bool approved);
}

/// @title OracleValidationModule
/// @notice Delegates approval decisions to an external oracle contract.
/// @dev Useful for specialised off-chain evaluation logic.
contract OracleValidationModule is IValidationModule, Ownable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    IJobRegistry public jobRegistry;
    IValidationOracle public oracle;

    event JobRegistryUpdated(address registry);
    event OracleUpdated(address oracle);

    constructor(IJobRegistry _jobRegistry, IValidationOracle _oracle)
        Ownable(msg.sender)
    {
        if (address(_jobRegistry) != address(0)) {
            jobRegistry = _jobRegistry;
            emit JobRegistryUpdated(address(_jobRegistry));
        }
        if (address(_oracle) != address(0)) {
            oracle = _oracle;
            emit OracleUpdated(address(_oracle));
        }
    }

    /// @notice Update the JobRegistry reference.
    function setJobRegistry(IJobRegistry registry) external onlyOwner {
        jobRegistry = registry;
        emit JobRegistryUpdated(address(registry));
    }

    /// @notice Update the oracle used for validation decisions.
    function setOracle(IValidationOracle _oracle) external onlyOwner {
        oracle = _oracle;
        emit OracleUpdated(address(_oracle));
    }

    /// @inheritdoc IValidationModule
    function selectValidators(uint256, uint256)
        external
        pure
        override
        returns (address[] memory vals)
    {
        vals = new address[](0);
    }

    /// @inheritdoc IValidationModule
    function start(
        uint256 jobId,
        uint256 /*entropy*/
    ) external override returns (address[] memory vals) {
        vals = new address[](0);
        bool approved = oracle.approve(jobId, "");
        jobRegistry.onValidationResult(jobId, approved, vals);
    }

    /// @inheritdoc IValidationModule
    function commitValidation(
        uint256,
        bytes32,
        string calldata,
        bytes32[] calldata
    ) external pure override {}


    /// @inheritdoc IValidationModule
    function revealValidation(
        uint256,
        bool,
        bytes32,
        bytes32,
        string calldata,
        bytes32[] calldata
    ) external pure override {}


    /// @inheritdoc IValidationModule
    function finalize(uint256) external pure override returns (bool) {
        return true;
    }

    /// @inheritdoc IValidationModule
    function finalizeValidation(uint256) external pure override returns (bool) {
        return true;
    }

    /// @inheritdoc IValidationModule
    function forceFinalize(uint256) external pure override returns (bool) {
        return true;
    }

    /// @inheritdoc IValidationModule
    function setParameters(
        uint256,
        uint256,
        uint256,
        uint256,
        uint256
    ) external pure override {}

    /// @inheritdoc IValidationModule
    function setValidatorsPerJob(uint256) external pure override {}

    /// @inheritdoc IValidationModule
    function setCommitRevealWindows(uint256, uint256)
        external
        pure
        override
    {}

    /// @inheritdoc IValidationModule
    function setTiming(uint256, uint256) external pure override {}

    /// @inheritdoc IValidationModule
    function setValidatorBounds(uint256, uint256)
        external
        pure
        override
    {}

    /// @inheritdoc IValidationModule
    function setRequiredValidatorApprovals(uint256)
        external
        pure
        override
    {}

    /// @inheritdoc IValidationModule
    function resetJobNonce(uint256) external pure override {}

    /// @inheritdoc IValidationModule
    function setApprovalThreshold(uint256) external pure override {}

    /// @inheritdoc IValidationModule
    function setValidatorSlashingPct(uint256) external pure override {}

    /// @inheritdoc IValidationModule
    function setNonRevealPenalty(uint256, uint256) external pure override {}

    /// @inheritdoc IValidationModule
    function setEarlyFinalizeDelay(uint256) external pure override {}

    function setForceFinalizeGrace(uint256) external pure override {}

    /// @inheritdoc IValidationModule
    function setValidatorSubdomains(
        address[] calldata,
        string[] calldata
    ) external pure override {}

    function setMySubdomain(string calldata) external pure override {}

    /// @inheritdoc IValidationModule
    function validators(uint256)
        external
        pure
        override
        returns (address[] memory list)
    {
        list = new address[](0);
    }

    /// @inheritdoc IValidationModule
    function votes(uint256, address)
        external
        pure
        override
        returns (bool)
    {
        return true;
    }

    /// @inheritdoc IValidationModule
    function setSelectionStrategy(IValidationModule.SelectionStrategy)
        external
        pure
        override
    {}

    function bumpValidatorAuthCacheVersion() external pure override {}

    /// @dev Reject direct ETH transfers to keep the module tax neutral.
    receive() external payable {
        revert("OracleValidationModule: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("OracleValidationModule: no ether");
    }
}

