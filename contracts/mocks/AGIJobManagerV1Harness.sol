// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

import "../AGIJobManagerv1.sol";

/// @dev Test harness exposing internal functions for testing purposes.
contract AGIJobManagerV1Harness is AGIJobManagerV1 {
    constructor(
        address _agiTokenAddress,
        string memory _baseURI,
        address _ensAddress,
        address _nameWrapperAddress,
        bytes32 _clubRootNode,
        bytes32 _agentRootNode,
        bytes32 _validatorMerkleRoot,
        bytes32 _agentMerkleRoot
    )
        AGIJobManagerV1(
            _agiTokenAddress,
            _baseURI,
            _ensAddress,
            _nameWrapperAddress,
            _clubRootNode,
            _agentRootNode,
            _validatorMerkleRoot,
            _agentMerkleRoot
        )
    {}

    function callVerifyOwnership(
        address claimant,
        string memory subdomain,
        bytes32[] calldata proof,
        bytes32 rootNode
    ) external returns (bool) {
        return _verifyOwnership(claimant, subdomain, proof, rootNode);
    }
}
