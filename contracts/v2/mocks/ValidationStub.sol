// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IValidationModule} from "../interfaces/IValidationModule.sol";
import {IJobRegistry} from "../interfaces/IJobRegistry.sol";

/// @notice Simple validation module stub returning a preset outcome.
contract ValidationStub is IValidationModule {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    bool public result;
    address public jobRegistry;
    address[] public validatorList;

    function setJobRegistry(address registry) external {
        jobRegistry = registry;
    }

    function setResult(bool _result) external {
        result = _result;
    }

    function setValidators(address[] calldata vals) external {
        validatorList = vals;
    }

    function selectValidators(uint256, uint256) public view override returns (address[] memory) {
        return validatorList;
    }

    function start(
        uint256 jobId,
        uint256 entropy
    ) external view override returns (address[] memory vals) {
        vals = selectValidators(jobId, entropy);
    }

    function commitValidation(
        uint256,
        bytes32,
        string calldata,
        bytes32[] calldata
    ) external override {}

    function revealValidation(
        uint256,
        bool,
        bytes32,
        bytes32,
        string calldata,
        bytes32[] calldata
    ) external override {}

    function finalize(uint256 jobId) external override returns (bool success) {
        success = result;
        if (jobRegistry != address(0)) {
            IJobRegistry(jobRegistry).onValidationResult(jobId, success, validatorList);
        }
    }

    function finalizeValidation(uint256 jobId) external override returns (bool success) {
        return this.finalize(jobId);
    }

    function forceFinalize(uint256 jobId) external override returns (bool success) {
        return this.finalize(jobId);
    }

    function validators(uint256) external view override returns (address[] memory vals) {
        vals = validatorList;
    }

    function votes(uint256, address)
        external
        view
        override
        returns (bool approved)
    {
        approved = result;
    }

    function setCommitRevealWindows(uint256, uint256) external override {}

    function setTiming(uint256, uint256) external override {}

    function setValidatorBounds(uint256, uint256) external override {}

    function setValidatorsPerJob(uint256) external override {}

    function setApprovalThreshold(uint256) external override {}

    function setAutoApprovalTarget(bool) external override {}

    function setValidatorSlashingPct(uint256) external override {}

    function setNonRevealPenalty(uint256, uint256) external override {}

    function setRevealQuorum(uint256, uint256) external override {}

    function setEarlyFinalizeDelay(uint256) external override {}

    function setForceFinalizeGrace(uint256) external override {}

    function setValidatorSubdomains(
        address[] calldata,
        string[] calldata
    ) external override {}

    function setMySubdomain(string calldata) external override {}

    function setParameters(
        uint256,
        uint256,
        uint256,
        uint256,
        uint256
    ) external override {}

    function setRequiredValidatorApprovals(uint256) external override {}

    function resetJobNonce(uint256) external override {}

    function setSelectionStrategy(IValidationModule.SelectionStrategy) external override {}

    function bumpValidatorAuthCacheVersion() external override {}

    function triggerFailover(
        uint256,
        IValidationModule.FailoverAction,
        uint64,
        string calldata
    ) external override {}

    function failoverStates(uint256)
        external
        pure
        override
        returns (
            IValidationModule.FailoverAction action,
            uint64 extensions,
            uint64 lastExtendedTo,
            uint64 lastTriggeredAt,
            bool escalated
        )
    {
        return (IValidationModule.FailoverAction.None, 0, 0, 0, false);
    }

}

