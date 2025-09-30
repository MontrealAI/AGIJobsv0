// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IJobRegistryKernel {
    function onValidationApproved(
        uint256 jobId,
        address[] calldata validators,
        address[] calldata nonRevealers
    ) external;

    function onValidationRejected(
        uint256 jobId,
        address[] calldata validators,
        address[] calldata nonRevealers
    ) external;

    function onValidationQuorumFailure(uint256 jobId, address[] calldata nonRevealers) external;
}
