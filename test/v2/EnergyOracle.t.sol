// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {EnergyOracle} from "../../contracts/v2/EnergyOracle.sol";

contract EnergyOracleTest is Test {
    EnergyOracle oracle;
    uint256 signerPk;
    address signer;

    function setUp() public {
        oracle = new EnergyOracle();
        signerPk = 0xA11CE;
        signer = vm.addr(signerPk);
        oracle.setSigner(signer, true);
    }

    function _att() internal view returns (EnergyOracle.Attestation memory att) {
        att.jobId = 1;
        att.user = address(0xBEEF);
        att.energy = int256(1);
        att.degeneracy = 2;
        att.nonce = 1;
        att.deadline = block.timestamp + 1 hours;
    }

    function _hash(EnergyOracle.Attestation memory att) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                oracle.TYPEHASH(),
                att.jobId,
                att.user,
                att.energy,
                att.degeneracy,
                att.nonce,
                att.deadline
            )
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("EnergyOracle")),
                keccak256(bytes("1")),
                block.chainid,
                address(oracle)
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function test_verify_valid_signature() public {
        EnergyOracle.Attestation memory att = _att();
        bytes32 digest = _hash(att);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        address recovered = oracle.verify(att, sig);
        assertEq(recovered, signer);
    }

    function test_verify_invalid_signature() public {
        EnergyOracle.Attestation memory att = _att();
        bytes32 digest = _hash(att);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBADD, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        address recovered = oracle.verify(att, sig);
        assertEq(recovered, address(0));
    }

    function test_verify_expired_deadline() public {
        EnergyOracle.Attestation memory att = _att();
        att.deadline = block.timestamp - 1;
        bytes32 digest = _hash(att);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        address recovered = oracle.verify(att, sig);
        assertEq(recovered, address(0));
    }

    function test_verify_rejects_replay() public {
        EnergyOracle.Attestation memory att = _att();
        bytes32 digest = _hash(att);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        address recovered = oracle.verify(att, sig);
        assertEq(recovered, signer);
        recovered = oracle.verify(att, sig);
        assertEq(recovered, address(0));
    }
}

