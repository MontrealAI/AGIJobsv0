// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IEnergyOracle} from "./interfaces/IEnergyOracle.sol";
import {Governable} from "./Governable.sol";

/// @title EnergyOracle
/// @notice Verifies signed energy attestations used for reward settlement.
contract EnergyOracle is EIP712, Governable, IEnergyOracle {
    using ECDSA for bytes32;

    /// @dev Thrown when batched signer updates receive mismatched array lengths.
    error LengthMismatch();

    /// @notice Emitted when a signer is added or removed from the oracle.
    /// @param signer The address of the signer that was updated.
    /// @param allowed True if the signer is authorized, false if removed.
    event SignerUpdated(address indexed signer, bool allowed);

    bytes32 public constant TYPEHASH = keccak256(
        "EnergyAttestation(uint256 jobId,address user,int256 energy,uint256 degeneracy,uint256 epochId,uint8 role,uint256 nonce,uint256 deadline,uint256 uPre,uint256 uPost,uint256 value)"
    );

    mapping(address => bool) public signers;
    mapping(address => uint256) public nonces;

    constructor(address _governance) EIP712("EnergyOracle", "1") Governable(_governance) {}

    /// @notice Enable or disable a signer authorised to attest energy usage.
    /// @param signer The address of the signer to update.
    /// @param allowed Whether the signer is allowed to sign attestations.
    function setSigner(address signer, bool allowed) external onlyGovernance {
        signers[signer] = allowed;
        emit SignerUpdated(signer, allowed);
    }

    /// @notice Update multiple signer permissions in a single governance call.
    /// @param signers_ Array of signer addresses to update.
    /// @param allowed Array of flags indicating whether each signer is enabled.
    function setSigners(address[] calldata signers_, bool[] calldata allowed)
        external
        onlyGovernance
    {
        uint256 length = signers_.length;
        if (length != allowed.length) revert LengthMismatch();

        for (uint256 i = 0; i < length; ++i) {
            address signer = signers_[i];
            bool status = allowed[i];
            signers[signer] = status;
            emit SignerUpdated(signer, status);
        }
    }

    /// @inheritdoc IEnergyOracle
    function verify(IEnergyOracle.Attestation calldata att, bytes calldata sig)
        external
        override
        returns (address signer)
    {
        if (att.deadline < block.timestamp) return address(0);
        if (att.nonce <= nonces[att.user]) return address(0);
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    TYPEHASH,
                    att.jobId,
                    att.user,
                    att.energy,
                    att.degeneracy,
                    att.epochId,
                    att.role,
                    att.nonce,
                    att.deadline,
                    att.uPre,
                    att.uPost,
                    att.value
                )
            )
        );
        signer = ECDSA.recover(digest, sig);
        if (!signers[signer]) return address(0);
        nonces[att.user] = att.nonce;
    }
}
