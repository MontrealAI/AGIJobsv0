// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IValidationModule} from "../interfaces/IValidationModule.sol";
import {IJobRegistry} from "../interfaces/IJobRegistry.sol";

/// @notice Simple validation module stub returning a preset outcome.
contract ValidationStub is IValidationModule {
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

    function selectValidators(uint256) public view override returns (address[] memory) {
        return validatorList;
    }

    function startValidation(uint256 jobId, string calldata)
        external
        override
        returns (address[] memory validators)
    {
        validators = selectValidators(jobId);
    }

    function commitValidation(
        uint256,
        bytes32,
        string calldata,
        bytes32[] calldata
    ) external override {}

    function commitValidation(uint256, bytes32) external override {}

    function revealValidation(
        uint256,
        bool,
        bytes32,
        string calldata,
        bytes32[] calldata
    ) external override {}

    function revealValidation(uint256, bool, bytes32) external override {}

    function finalize(uint256 jobId) external override returns (bool success) {
        success = result;
        if (jobRegistry != address(0)) {
            uint256 approvals = result ? 1 : 0;
            uint256 rejections = result ? 0 : 1;
            IJobRegistry(jobRegistry).validationComplete(
                jobId,
                success,
                approvals,
                rejections
            );
        }
    }

    function finalizeValidation(uint256 jobId) external override returns (bool success) {
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

    function setValidatorSlashingPct(uint256) external override {}

    function setValidatorSubdomains(
        address[] calldata,
        string[] calldata
    ) external override {}

    function setParameters(
        uint256,
        uint256,
        uint256,
        uint256,
        uint256
    ) external override {}

    function setRequiredValidatorApprovals(uint256) external override {}

    function resetJobNonce(uint256) external override {}
}

