// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IJobRegistry} from "../interfaces/IJobRegistry.sol";
import {IValidationModule} from "../interfaces/IValidationModule.sol";

/// @title NoValidationModule
/// @notice Bypasses validator selection and automatically approves submissions.
/// @dev Intended for low-stakes jobs where external validation is unnecessary.
contract NoValidationModule is IValidationModule, Ownable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    IJobRegistry public jobRegistry;

    event JobRegistryUpdated(address registry);

    constructor(IJobRegistry _jobRegistry) Ownable(msg.sender) {
        if (address(_jobRegistry) != address(0)) {
            jobRegistry = _jobRegistry;
            emit JobRegistryUpdated(address(_jobRegistry));
        }
    }

    /// @notice Set the JobRegistry reference.
    function setJobRegistry(IJobRegistry registry) external onlyOwner {
        jobRegistry = registry;
        emit JobRegistryUpdated(address(registry));
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
        jobRegistry.onValidationResult(jobId, true, vals);
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
        revert("NoValidationModule: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("NoValidationModule: no ether");
    }
}

