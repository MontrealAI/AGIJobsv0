// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";

import {CultureRegistry} from "../../contracts/v2/CultureRegistry.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract MockIdentityRegistry {
    mapping(address => bool) public authorisedAgents;

    function setAgent(address account, bool allowed) external {
        authorisedAgents[account] = allowed;
    }

    function isAuthorizedAgent(address account, string calldata, bytes32[] calldata) external view returns (bool) {
        return authorisedAgents[account];
    }
}

contract CultureRegistryTest is Test {
    CultureRegistry internal registry;
    MockIdentityRegistry internal identity;

    address internal owner = address(this);
    address internal author = address(0xA11CE);
    address internal other = address(0xBEEF);

    string internal constant KIND_BOOK = "book";
    string internal constant KIND_PROMPT = "prompt";
    string internal constant SUBDOMAIN = "alice";

    bytes32[] internal emptyProof;

    function setUp() public {
        identity = new MockIdentityRegistry();
        identity.setAgent(author, true);

        string[] memory kinds = new string[](2);
        kinds[0] = KIND_BOOK;
        kinds[1] = KIND_PROMPT;

        registry = new CultureRegistry(owner, address(identity), kinds, 4);
    }

    function _mint(string memory kind, string memory uri) internal returns (uint256) {
        vm.prank(author);
        return registry.mintArtifact(kind, uri, 0, new uint256[](0), SUBDOMAIN, emptyProof);
    }

    function testMintArtifactHappyPath() public {
        uint256 artifactId = _mint(KIND_BOOK, "ipfs://artifact-1");
        assertEq(artifactId, 1);

        CultureRegistry.ArtifactView memory viewData = registry.getArtifact(artifactId);
        assertEq(viewData.author, author);
        assertEq(viewData.kind, KIND_BOOK);
        assertEq(viewData.uri, "ipfs://artifact-1");
        assertEq(viewData.parentId, 0);
        assertEq(viewData.citations.length, 0);
    }

    function testMintArtifactWithParentAndCitation() public {
        uint256 parentId = _mint(KIND_BOOK, "ipfs://parent");

        uint256[] memory cites = new uint256[](1);
        cites[0] = parentId;

        vm.prank(author);
        uint256 childId = registry.mintArtifact(KIND_PROMPT, "ipfs://child", parentId, cites, SUBDOMAIN, emptyProof);

        CultureRegistry.ArtifactView memory child = registry.getArtifact(childId);
        assertEq(child.parentId, parentId);
        assertEq(child.citations.length, 1);
        assertEq(child.citations[0], parentId);
    }

    function testMintArtifactRejectsUnauthorisedAuthor() public {
        vm.expectRevert(abi.encodeWithSelector(CultureRegistry.NotAuthorised.selector, other));
        vm.prank(other);
        registry.mintArtifact(KIND_BOOK, "ipfs://unauthorised", 0, new uint256[](0), SUBDOMAIN, emptyProof);
    }

    function testMintArtifactRejectsUnknownKind() public {
        vm.prank(author);
        vm.expectRevert(CultureRegistry.InvalidKind.selector);
        registry.mintArtifact("dataset", "ipfs://dataset", 0, new uint256[](0), SUBDOMAIN, emptyProof);
    }

    function testMintArtifactRejectsMissingCitation() public {
        _mint(KIND_BOOK, "ipfs://a");

        uint256[] memory cites = new uint256[](1);
        cites[0] = 42;

        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(CultureRegistry.InvalidCitation.selector, 42));
        registry.mintArtifact(KIND_PROMPT, "ipfs://b", 0, cites, SUBDOMAIN, emptyProof);
    }

    function testMintArtifactRejectsDuplicateCitations() public {
        uint256 cited = _mint(KIND_BOOK, "ipfs://base");

        uint256[] memory cites = new uint256[](2);
        cites[0] = cited;
        cites[1] = cited;

        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(CultureRegistry.DuplicateCitation.selector, cited));
        registry.mintArtifact(KIND_PROMPT, "ipfs://dup", 0, cites, SUBDOMAIN, emptyProof);
    }

    function testCiteRejectsSelfReference() public {
        uint256 artifactId = _mint(KIND_BOOK, "ipfs://self");

        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(CultureRegistry.SelfCitation.selector, artifactId));
        registry.cite(artifactId, artifactId);
    }

    function testCiteRejectsDuplicate() public {
        uint256 a = _mint(KIND_BOOK, "ipfs://a");
        uint256 b = _mint(KIND_BOOK, "ipfs://b");

        vm.prank(author);
        registry.cite(b, a);

        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(CultureRegistry.DuplicateCitation.selector, a));
        registry.cite(b, a);
    }

    function testPauseBlocksMinting() public {
        registry.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(author);
        registry.mintArtifact(KIND_BOOK, "ipfs://paused", 0, new uint256[](0), SUBDOMAIN, emptyProof);
    }

    function testOwnerCanUpdateAllowedKind() public {
        registry.setAllowedKind("dataset", true);

        uint256[] memory cites;
        vm.prank(author);
        uint256 id = registry.mintArtifact("dataset", "ipfs://dataset", 0, cites, SUBDOMAIN, emptyProof);
        assertEq(id, 1);
    }

    function testFuzzMintStoresUniqueCitations(uint256 saltA, uint256 saltB) public {
        uint256 baseA = _mint(KIND_BOOK, "ipfs://baseA");
        uint256 baseB = _mint(KIND_PROMPT, "ipfs://baseB");

        uint256 citeA = (saltA % 2 == 0) ? baseA : baseB;
        uint256 citeB = (saltB % 2 == 0) ? baseA : baseB;
        vm.assume(citeA != citeB);

        uint256[] memory cites = new uint256[](2);
        cites[0] = citeA;
        cites[1] = citeB;

        vm.prank(author);
        uint256 mintedId = registry.mintArtifact(KIND_BOOK, "ipfs://c", 0, cites, SUBDOMAIN, emptyProof);

        CultureRegistry.ArtifactView memory viewData = registry.getArtifact(mintedId);
        assertEq(viewData.citations.length, 2);
        assertEq(viewData.citations[0], citeA);
        assertEq(viewData.citations[1], citeB);
    }
}
