// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;
/// @dev Negative deployment fixture representing pre-percentage implementation identifiers.
contract LegacyJobImplementationIdentity {
    bytes32 private immutable _id;
    constructor(bytes32 id_) { _id = id_; }
    function moduleId() external view returns (bytes32) { return _id; }
}
