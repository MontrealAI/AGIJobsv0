// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title EnergyOracle
/// @notice Verifies signed energy attestations used for reward settlement.
contract EnergyOracle is EIP712, Ownable {
    using ECDSA for bytes32;

    bytes32 public constant TYPEHASH = keccak256(
        "EnergyAttestation(uint256 jobId,address user,int256 energy,uint256 degeneracy,uint256 nonce,uint256 deadline)"
    );

    mapping(address => bool) public signers;
    mapping(address => uint256) public nonces;

    struct Attestation {
        uint256 jobId;
        address user;
        int256 energy;
        uint256 degeneracy;
        uint256 nonce;
        uint256 deadline;
    }

    constructor() EIP712("EnergyOracle", "1") Ownable(msg.sender) {}

    function setSigner(address signer, bool allowed) external onlyOwner {
        signers[signer] = allowed;
    }

    function verify(Attestation calldata att, bytes calldata sig) external view returns (bool) {
        if (att.deadline < block.timestamp) return false;
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    TYPEHASH,
                    att.jobId,
                    att.user,
                    att.energy,
                    att.degeneracy,
                    att.nonce,
                    att.deadline
                )
            )
        );
        address signer = ECDSA.recover(digest, sig);
        return signers[signer];
    }
}

