// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title DemoZkAttestor
/// @notice Simplified ZK attestor accepting batched proofs derived from a trusted prover key.
contract DemoZkAttestor is Ownable {
    bytes32 public verifierKey;
    event VerifierKeyUpdated(bytes32 indexed newKey);

    constructor(address owner_, bytes32 key) Ownable(owner_) {
        verifierKey = key;
        emit VerifierKeyUpdated(key);
    }

    function setVerifierKey(bytes32 newKey) external onlyOwner {
        verifierKey = newKey;
        emit VerifierKeyUpdated(newKey);
    }

    function verifyBatch(
        bytes32 jobsRoot,
        uint256 jobCount,
        bytes calldata proof,
        bytes calldata publicSignals
    ) external view returns (bool) {
        bytes32 expected = keccak256(abi.encode(jobsRoot, jobCount, publicSignals, verifierKey));
        return proof.length == 32 && bytes32(proof) == expected;
    }
}
