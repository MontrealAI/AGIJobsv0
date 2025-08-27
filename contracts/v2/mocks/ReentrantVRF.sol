// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IVRFConsumer} from "../interfaces/IVRFConsumer.sol";
import {IValidationModule} from "../interfaces/IValidationModule.sol";

/// @dev VRF mock that attempts to reenter ValidationModule.requestVRF.
contract ReentrantVRF is IVRFConsumer {
    IValidationModule public validation;
    bool public attack;
    uint256 public jobId;
    uint256 public nextRequestId = 1;

    function setValidationModule(address vm) external {
        validation = IValidationModule(vm);
    }

    function attackRequest(uint256 _jobId) external {
        attack = true;
        jobId = _jobId;
    }

    function requestRandomWords() external override returns (uint256 requestId) {
        requestId = nextRequestId++;
        if (attack) {
            attack = false;
            validation.requestVRF(jobId);
        }
    }
}
