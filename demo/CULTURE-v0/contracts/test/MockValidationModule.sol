// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IValidationModule} from "../SelfPlayArena.sol";

contract MockValidationModule is IValidationModule {
    bool public finalizeSuccess = true;
    bool public forceFinalizeSuccess = true;

    uint256 public lastStartJobId;
    uint256 public lastStartEntropy;
    uint256 public finalizeCalls;
    uint256 public forceFinalizeCalls;

    address[] internal _selectedValidators;

    function setStartValidators(address[] calldata validators) external {
        delete _selectedValidators;
        for (uint256 i = 0; i < validators.length; i++) {
            _selectedValidators.push(validators[i]);
        }
    }

    function setFinalizeSuccess(bool success) external {
        finalizeSuccess = success;
    }

    function setForceFinalizeSuccess(bool success) external {
        forceFinalizeSuccess = success;
    }

    function start(uint256 jobId, uint256 entropy) external override returns (address[] memory) {
        lastStartJobId = jobId;
        lastStartEntropy = entropy;
        return _selectedValidators;
    }

    function finalize(uint256 jobId) external override returns (bool) {
        jobId; // silence compiler warning for mock usage
        finalizeCalls += 1;
        return finalizeSuccess;
    }

    function forceFinalize(uint256 jobId) external override returns (bool) {
        jobId;
        forceFinalizeCalls += 1;
        return forceFinalizeSuccess;
    }
}

