// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IValidationModule} from "../interfaces/IValidationModule.sol";
import {IJobRegistry} from "../interfaces/IJobRegistry.sol";

/// @notice Simple validation module stub returning a preset outcome.
contract ValidationStub is IValidationModule {
    bool public result;
    address public jobRegistry;

    function setJobRegistry(address registry) external {
        jobRegistry = registry;
    }

    function setResult(bool _result) external {
        result = _result;
    }

    function selectValidators(uint256) public pure override returns (address[] memory) {
        return new address[](0);
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
            IJobRegistry(jobRegistry).finalizeAfterValidation(jobId, success);
        }
    }

    function finalizeValidation(uint256 jobId) external override returns (bool success) {
        return this.finalize(jobId);
    }

    function validators(uint256) external pure override returns (address[] memory vals) {
        vals = new address[](0);
    }

    function setCommitRevealWindows(uint256, uint256) external override {}

    function setTiming(uint256, uint256) external override {}

    function setValidatorBounds(uint256, uint256) external override {}

    function setApprovalThreshold(uint256) external override {}

    function setValidatorSlashingPct(uint256) external override {}

    function addAdditionalValidator(address) external override {}

    function removeAdditionalValidator(address) external override {}

    function setENSRoots(bytes32, bytes32) external override {}

    function setMerkleRoots(bytes32, bytes32) external override {}

    function setValidatorSubdomains(
        address[] calldata,
        string[] calldata
    ) external override {}

    function resetJobNonce(uint256) external override {}
}

