// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IZkBatchVerifier {
    function verify(bytes calldata proof, bytes32 jobsRoot, bytes32 witness) external view returns (bool);
    function verifyingKey() external view returns (bytes32);
}
