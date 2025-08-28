// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IVRF {
    function randomness(uint256 jobId) external view returns (uint256);
    function requestVRF(uint256 jobId) external;
}
