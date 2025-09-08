// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "contracts/v2/modules/ENSOwnershipVerifier.sol";

contract MockENS {
    mapping(bytes32 => address) public resolvers;
    function resolver(bytes32 node) external view returns (address) { return resolvers[node]; }
    function setResolver(bytes32 node, address res) external { resolvers[node] = res; }
}

contract MockResolver {
    mapping(bytes32 => address) public addrs;
    function addr(bytes32 node) external view returns (address) { return addrs[node]; }
    function setAddr(bytes32 node, address a) external { addrs[node] = a; }
}

contract MockNameWrapper {
    mapping(uint256 => address) public owners;
    function ownerOf(uint256 node) external view returns (address) { return owners[node]; }
    function setOwner(uint256 node, address owner) external { owners[node] = owner; }
}

contract ENSOwnershipVerifierTest {
    ENSOwnershipVerifier verifier;
    MockENS ens;
    MockResolver resolver;
    MockNameWrapper wrapper;
    address agent = address(0xA1);
    bytes32 root = keccak256(abi.encodePacked("agi"));

    function setUp() public {
        ens = new MockENS();
        resolver = new MockResolver();
        wrapper = new MockNameWrapper();
        verifier = new ENSOwnershipVerifier(IENS(address(ens)), INameWrapper(address(wrapper)), bytes32(0));
        verifier.setAgentRootNode(root);
    }

    function namehash(bytes32 parent, string memory label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(parent, keccak256(bytes(label))));
    }

    function testRejectsUnverifiedSubdomain() public {
        bool ok = verifier.verifyAgent(agent, "a", new bytes32[](0));
        require(!ok, "should fail");
    }

    function testVerifiesWithNameWrapper() public {
        bytes32 node = namehash(root, "a");
        wrapper.setOwner(uint256(node), agent);
        bool ok = verifier.verifyAgent(agent, "a", new bytes32[](0));
        require(ok, "should verify");
    }
}
