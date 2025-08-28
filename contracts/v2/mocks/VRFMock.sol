// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IVRF} from "../interfaces/IVRF.sol";

contract VRFMock is IVRF {
    mapping(uint256 => uint256) public override randomness;
    uint256 public lastRequest;

    function requestVRF(uint256 jobId) external override {
        lastRequest = jobId;
    }

    function setRandomness(uint256 jobId, uint256 value) external {
        randomness[jobId] = value;
    }
}
