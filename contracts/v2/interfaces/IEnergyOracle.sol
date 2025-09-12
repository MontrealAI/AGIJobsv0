// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IEnergyOracle {
    struct Attestation {
        uint256 jobId;
        address user;
        int256 energy;
        uint256 degeneracy;
        uint256 epochId;
        uint8 role;
        uint256 nonce;
        uint256 deadline;
        uint256 uPre;
        uint256 uPost;
        uint256 value;
    }

    /// @return signer Address of oracle signer if signature valid, zero address otherwise
    function verify(Attestation calldata att, bytes calldata sig) external returns (address signer);
}

