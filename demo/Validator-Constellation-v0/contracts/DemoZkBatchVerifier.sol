// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IZkBatchVerifier} from "./interfaces/IZkBatchVerifier.sol";

/// @title DemoZkBatchVerifier
/// @notice Deterministic verifier used by the Validator Constellation demo. It
///         mimics a zk-SNARK verifier by checking that the supplied proof
///         commits to the jobs root and witness with a governance-controlled
///         verifying key. In production the contract can be replaced with a
///         Groth16 or Plonk verifier without altering the integration surface.
contract DemoZkBatchVerifier is Ownable, IZkBatchVerifier {
    bytes32 public verifyingKey;

    event VerifyingKeyUpdated(bytes32 verifyingKey);

    error InvalidKey();

    constructor(bytes32 verifyingKey_) Ownable(msg.sender) {
        verifyingKey = verifyingKey_;
    }

    function updateVerifyingKey(bytes32 verifyingKey_) external onlyOwner {
        verifyingKey = verifyingKey_;
        emit VerifyingKeyUpdated(verifyingKey_);
    }

    function verify(bytes calldata proof, bytes32 jobsRoot, bytes32 witness) external view override returns (bool) {
        if (verifyingKey == bytes32(0)) revert InvalidKey();
        return keccak256(proof) == keccak256(abi.encodePacked(verifyingKey, jobsRoot, witness));
    }
}
