// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {CultureRegistry, IIdentityRegistry} from "../contracts/CultureRegistry.sol";

contract MockIdentityRegistry is IIdentityRegistry {
    mapping(bytes32 => mapping(address => bool)) public roles;

    function setRole(bytes32 role, address account, bool allowed) external {
        roles[role][account] = allowed;
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return roles[role][account];
    }
}

contract CultureRegistryTest is Test {
    bytes32 internal constant AUTHOR_ROLE = keccak256("AUTHOR_ROLE");
    CultureRegistry internal registry;
    MockIdentityRegistry internal identity;

    address internal owner = address(0xA11CE);
    address internal author = address(0xBEEF);
    address internal stranger = address(0xBAD);

    function setUp() public {
        identity = new MockIdentityRegistry();
        identity.setRole(AUTHOR_ROLE, author, true);

        string[] memory kinds = new string[](2);
        kinds[0] = "book";
        kinds[1] = "prompt";

        registry = new CultureRegistry(owner, address(identity), kinds, 8);
    }

    function testMintArtifactSucceeds() public {
        vm.prank(author);
        uint256 artifactId = registry.mintArtifact("book", "cid://artifact-1", 0, new uint256[](0));

        CultureRegistry.ArtifactView memory viewData = registry.getArtifact(artifactId);
        assertEq(viewData.author, author);
        assertEq(viewData.kind, "book");
        assertEq(viewData.cid, "cid://artifact-1");
        assertEq(viewData.parentId, 0);
        assertEq(viewData.cites.length, 0);
    }

    function testMintArtifactWithParentAndCitations() public {
        vm.prank(author);
        uint256 parentId = registry.mintArtifact("book", "cid://artifact-parent", 0, new uint256[](0));

        uint256[] memory cites = new uint256[](1);
        cites[0] = parentId;

        vm.prank(author);
        uint256 childId = registry.mintArtifact("prompt", "cid://artifact-child", parentId, cites);

        CultureRegistry.ArtifactView memory child = registry.getArtifact(childId);
        assertEq(child.parentId, parentId);
        assertEq(child.cites.length, 1);
        assertEq(child.cites[0], parentId);
    }

    function testMintArtifactRevertsForNonAuthor() public {
        vm.prank(stranger);
        vm.expectRevert(CultureRegistry.NotAuthorised.selector);
        registry.mintArtifact("book", "cid://artifact", 0, new uint256[](0));
    }

    function testCiteAddsCitation() public {
        vm.prank(author);
        uint256 a = registry.mintArtifact("book", "cid://a", 0, new uint256[](0));
        vm.prank(author);
        uint256 b = registry.mintArtifact("book", "cid://b", 0, new uint256[](0));

        vm.prank(author);
        registry.cite(b, a);

        CultureRegistry.ArtifactView memory artifactB = registry.getArtifact(b);
        assertEq(artifactB.cites.length, 1);
        assertEq(artifactB.cites[0], a);
    }

    function testSetAllowedKind() public {
        vm.prank(owner);
        registry.setAllowedKind("dataset", true);

        vm.prank(author);
        uint256 id = registry.mintArtifact("dataset", "cid://dataset", 0, new uint256[](0));
        assertEq(id, 1);
    }

    function testCiteRejectsDuplicates() public {
        vm.prank(author);
        uint256 a = registry.mintArtifact("book", "cid://a", 0, new uint256[](0));
        vm.prank(author);
        uint256 b = registry.mintArtifact("book", "cid://b", 0, new uint256[](0));

        vm.prank(author);
        registry.cite(b, a);

        vm.expectRevert(abi.encodeWithSelector(CultureRegistry.DuplicateCitation.selector, a));
        vm.prank(author);
        registry.cite(b, a);
    }
}
