// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IRandaoCoordinator {
    /// @notice Commit a hash of the sender address, tag and secret.
    function commit(bytes32 tag, bytes32 commitment) external payable;

    /// @notice Reveal the secret for a given tag.
    function reveal(bytes32 tag, uint256 secret) external;

    /// @notice Retrieve aggregated randomness for a tag after reveal window.
    function random(bytes32 tag) external view returns (uint256);
}
