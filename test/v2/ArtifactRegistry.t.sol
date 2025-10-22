// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {ArtifactRegistry} from "../../contracts/v2/ArtifactRegistry.sol";
import {IIdentityRegistry} from "../../contracts/v2/interfaces/IIdentityRegistry.sol";

contract IdentityStub is IIdentityRegistry {
    uint256 public constant version = 2;

    mapping(address => bool) public authorised;

    function setAuthorised(address account, bool allowed) external {
        authorised[account] = allowed;
    }

    // --- IIdentityRegistry ---
    function isAuthorizedAgent(address claimant, string calldata subdomain, bytes32[] calldata)
        external
        view
        override
        returns (bool)
    {
        if (bytes(subdomain).length == 0) {
            return false;
        }
        return authorised[claimant];
    }

    function isAuthorizedValidator(address, string calldata, bytes32[] calldata) external pure override returns (bool) {
        return false;
    }

    function verifyAgent(address claimant, string calldata subdomain, bytes32[] calldata)
        external
        view
        override
        returns (bool ok, bytes32 node, bool, bool)
    {
        ok = authorised[claimant] && bytes(subdomain).length > 0;
        node = bytes32(0);
    }

    function verifyValidator(address, string calldata, bytes32[] calldata)
        external
        pure
        override
        returns (bool, bytes32, bool, bool)
    {
        return (false, bytes32(0), false, false);
    }

    function verifyNode(address, string calldata, bytes32[] calldata)
        external
        pure
        override
        returns (bool, bytes32, bool, bool)
    {
        return (false, bytes32(0), false, false);
    }

    function setENS(address) external override {}

    function setNameWrapper(address) external override {}

    function setReputationEngine(address) external override {}

    function setAgentRootNode(bytes32) external override {}

    function setClubRootNode(bytes32) external override {}

    function setNodeRootNode(bytes32) external override {}

    function setAgentMerkleRoot(bytes32) external override {}

    function setValidatorMerkleRoot(bytes32) external override {}

    function addAdditionalAgent(address account) external override {
        authorised[account] = true;
    }

    function removeAdditionalAgent(address account) external override {
        authorised[account] = false;
    }

    function addAdditionalValidator(address) external override {}

    function removeAdditionalValidator(address) external override {}

    function addAdditionalNodeOperator(address) external override {}

    function removeAdditionalNodeOperator(address) external override {}

    function setAgentType(address, AgentType) external override {}

    function additionalAgents(address account) external view override returns (bool) {
        return authorised[account];
    }

    function additionalValidators(address) external pure override returns (bool) {
        return false;
    }

    function additionalNodeOperators(address) external pure override returns (bool) {
        return false;
    }

    function getAgentType(address) external pure override returns (AgentType) {
        return AgentType.Human;
    }

    function setAgentProfileURI(address, string calldata) external override {}

    function updateAgentProfile(string calldata, bytes32[] calldata, string calldata) external override {}

    function agentProfileURI(address) external pure override returns (string memory) {
        return "";
    }
}

contract ReentrantAuthor is IERC721Receiver {
    ArtifactRegistry public immutable registry;
    bytes32 public immutable lineageHash;

    constructor(ArtifactRegistry registry_, bytes32 lineageHash_) {
        registry = registry_;
        lineageHash = lineageHash_;
    }

    function mint(string calldata cid, string calldata kind) external {
        bytes32[] memory proof;
        uint256[] memory cites;
        registry.mintArtifact(cid, kind, lineageHash, cites, "author", proof);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external override returns (bytes4) {
        bytes32[] memory proof;
        uint256[] memory cites;
        // Attempt a re-entrant mint which should fail due to the guard.
        try registry.mintArtifact("ipfs://reenter", "loop", bytes32("loop"), cites, "author", proof) {
            revert("Reentrancy was not prevented");
        } catch {}

        return IERC721Receiver.onERC721Received.selector;
    }
}

contract ArtifactRegistryTest is Test {
    ArtifactRegistry internal registry;
    IdentityStub internal identity;

    address internal constant ADMIN = address(0xA11D);
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);

    function setUp() public {
        identity = new IdentityStub();
        vm.startPrank(ADMIN);
        registry = new ArtifactRegistry("Artifacts", "ART", 8);
        registry.setIdentityRegistry(identity);
        registry.grantRole(registry.DEFAULT_ADMIN_ROLE(), address(this));
        vm.stopPrank();
        identity.setAuthorised(ALICE, true);
    }

    function testMintArtifactStoresMetadata() public {
        bytes32[] memory proof;
        uint256[] memory cites;

        vm.prank(ALICE);
        uint256 tokenId = registry.mintArtifact("ipfs://artifact-1", "model", bytes32("hash1"), cites, "alice", proof);

        assertEq(tokenId, 1);
        assertEq(registry.ownerOf(tokenId), ALICE);

        ArtifactRegistry.Artifact memory data = registry.getArtifact(tokenId);
        assertEq(data.cid, "ipfs://artifact-1");
        assertEq(data.kind, "model");
        assertEq(data.lineageHash, bytes32("hash1"));
        assertEq(data.citations.length, 0);
        assertGt(data.mintedAt, 0);
        assertEq(data.influence, 0);
    }

    function testMintFanOutUpdatesInfluence() public {
        bytes32[] memory proof;
        uint256[] memory empty;

        vm.prank(ADMIN);
        uint256 baseA = registry.mintArtifact("ipfs://baseA", "dataset", bytes32("a"), empty, "owner", proof);
        vm.prank(ADMIN);
        uint256 baseB = registry.mintArtifact("ipfs://baseB", "dataset", bytes32("b"), empty, "owner", proof);

        uint256[] memory cites = new uint256[](2);
        cites[0] = baseA;
        cites[1] = baseB;

        vm.prank(ALICE);
        uint256 fanOut = registry.mintArtifact("ipfs://fanout", "model", bytes32("fan"), cites, "alice", proof);
        assertEq(fanOut, 3);

        ArtifactRegistry.Artifact memory a = registry.getArtifact(baseA);
        ArtifactRegistry.Artifact memory b = registry.getArtifact(baseB);
        assertEq(a.influence, 1);
        assertEq(b.influence, 1);

        ArtifactRegistry.Artifact memory minted = registry.getArtifact(fanOut);
        assertEq(minted.citations.length, 2);
        assertEq(minted.citations[0], baseA);
        assertEq(minted.citations[1], baseB);
    }

    function testMintRevertsForDuplicateCitations() public {
        bytes32[] memory proof;
        uint256[] memory empty;
        vm.prank(ADMIN);
        uint256 base = registry.mintArtifact("ipfs://base", "dataset", bytes32("base"), empty, "owner", proof);

        uint256[] memory cites = new uint256[](2);
        cites[0] = base;
        cites[1] = base;

        vm.startPrank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(ArtifactRegistry.DuplicateCitation.selector, base));
        registry.mintArtifact("ipfs://dup", "model", bytes32("dup"), cites, "alice", proof);
        vm.stopPrank();
    }

    function testMintRespectsDepthLimit() public {
        bytes32[] memory proof;

        uint256 previous;
        for (uint256 i; i <= registry.DFS_DEPTH_LIMIT(); ++i) {
            uint256[] memory cites;
            if (previous != 0) {
                cites = new uint256[](1);
                cites[0] = previous;
            }
            vm.prank(ADMIN);
            previous = registry.mintArtifact(
                string.concat("ipfs://chain-", vm.toString(i)),
                "dataset",
                bytes32(uint256(i + 1)),
                cites,
                "owner",
                proof
            );
        }

        uint256[] memory citeRoot = new uint256[](1);
        citeRoot[0] = previous;

        vm.startPrank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(ArtifactRegistry.CitationDepthExceeded.selector, registry.DFS_DEPTH_LIMIT())
        );
        registry.mintArtifact("ipfs://deep", "model", bytes32("deep"), citeRoot, "alice", proof);
        vm.stopPrank();
    }

    function testMintRevertsWhenIdentityNotAuthorised() public {
        bytes32[] memory proof;
        uint256[] memory cites;

        vm.startPrank(BOB);
        vm.expectRevert(abi.encodeWithSelector(ArtifactRegistry.UnauthorizedAuthor.selector, BOB));
        registry.mintArtifact("ipfs://bob", "model", bytes32("bob"), cites, "bob", proof);
        vm.stopPrank();
    }

    function testGrantRoleBypassesIdentity() public {
        bytes32[] memory proof;
        uint256[] memory cites;

        vm.prank(ADMIN);
        registry.grantRole(registry.AUTHOR_ROLE(), BOB);

        vm.prank(BOB);
        uint256 tokenId = registry.mintArtifact("ipfs://bob", "model", bytes32("bob"), cites, "", proof);
        assertEq(tokenId, 1);
    }

    function testUpdateArtifactMetadata() public {
        bytes32[] memory proof;
        uint256[] memory cites;
        vm.prank(ALICE);
        uint256 tokenId = registry.mintArtifact("ipfs://artifact", "prompt", bytes32("hash"), cites, "alice", proof);

        vm.prank(ALICE);
        registry.updateArtifactMetadata(tokenId, "ipfs://updated", "prompt-v2", bytes32("hash-new"));

        ArtifactRegistry.Artifact memory data = registry.getArtifact(tokenId);
        assertEq(data.cid, "ipfs://updated");
        assertEq(data.lineageHash, bytes32("hash-new"));
        assertEq(registry.lineageOwner(bytes32("hash-new")), tokenId);
    }

    function testUpdateMetadataRequiresOwnerOrApproved() public {
        bytes32[] memory proof;
        uint256[] memory cites;
        vm.prank(ALICE);
        uint256 tokenId = registry.mintArtifact("ipfs://artifact", "prompt", bytes32("hash"), cites, "alice", proof);

        vm.startPrank(BOB);
        vm.expectRevert(abi.encodeWithSelector(ArtifactRegistry.NotTokenOwnerOrApproved.selector, tokenId, BOB));
        registry.updateArtifactMetadata(tokenId, "ipfs://other", "prompt", bytes32("hash2"));
        vm.stopPrank();
    }

    function testPausePreventsMint() public {
        vm.prank(ADMIN);
        registry.pause();

        bytes32[] memory proof;
        uint256[] memory cites;
        vm.startPrank(ALICE);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        registry.mintArtifact("ipfs://paused", "model", bytes32("p"), cites, "alice", proof);
        vm.stopPrank();
    }

    function testSetMaxCitations() public {
        vm.prank(ADMIN);
        registry.setMaxCitations(16);
        assertEq(registry.maxCitations(), 16);

        vm.expectRevert(abi.encodeWithSelector(ArtifactRegistry.MaxCitationsExceeded.selector, 0, 16));
        vm.prank(ADMIN);
        registry.setMaxCitations(0);
    }

    function testIdentityRegistryVersionCheck() public {
        BadIdentity bad = new BadIdentity();
        vm.expectRevert(ArtifactRegistry.InvalidIdentityRegistry.selector);
        vm.prank(ADMIN);
        registry.setIdentityRegistry(bad);
    }

    function testReentrancyGuardBlocksNestedMint() public {
        vm.prank(ADMIN);
        registry.grantRole(registry.AUTHOR_ROLE(), address(this));

        ReentrantAuthor attacker = new ReentrantAuthor(registry, bytes32("outer"));
        vm.prank(ADMIN);
        registry.grantRole(registry.AUTHOR_ROLE(), address(attacker));

        attacker.mint("ipfs://outer", "loop");
        assertEq(registry.ownerOf(1), address(attacker));
    }

    function testFuzzLineageHashUniqueness(bytes32 firstHash, bytes32 secondHash) public {
        bytes32[] memory proof;
        uint256[] memory cites;

        vm.prank(ALICE);
        registry.mintArtifact("ipfs://first", "kind", firstHash, cites, "alice", proof);

        vm.assume(secondHash != firstHash);

        vm.prank(ALICE);
        registry.mintArtifact("ipfs://second", "kind", secondHash, cites, "alice", proof);
    }

    function testFuzzCitationCountCaps(uint8 citeCount, bytes32 seed) public {
        bytes32[] memory proof;
        uint256[] memory empty;

        uint256 available = registry.maxCitations();
        vm.assume(citeCount > available);

        uint256[] memory mintedIds = new uint256[](available);
        for (uint256 i; i < available; ++i) {
            vm.prank(ADMIN);
            mintedIds[i] = registry.mintArtifact(
                string.concat("ipfs://base-", vm.toString(i)),
                "kind",
                keccak256(abi.encode(seed, i)),
                empty,
                "owner",
                proof
            );
        }

        uint256[] memory cites = new uint256[](citeCount);
        for (uint256 i; i < citeCount; ++i) {
            cites[i] = mintedIds[i % available];
        }

        vm.startPrank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(ArtifactRegistry.MaxCitationsExceeded.selector, citeCount, available));
        registry.mintArtifact("ipfs://overflow", "kind", keccak256(abi.encode(seed, "overflow")), cites, "alice", proof);
        vm.stopPrank();
    }

    function testFuzzCitationGraph(uint8 width, uint8 depth) public {
        width = uint8(bound(width, 1, 3));
        depth = uint8(bound(depth, 1, 4));
        bytes32[] memory proof;

        uint256[][] memory levels = new uint256[][](depth);
        for (uint256 level; level < depth; ++level) {
            levels[level] = new uint256[](width);
            for (uint256 index; index < width; ++index) {
                uint256[] memory cites;
                if (level > 0) {
                    cites = new uint256[](width);
                    for (uint256 j; j < width; ++j) {
                        cites[j] = levels[level - 1][j];
                    }
                }

                vm.prank(ADMIN);
                levels[level][index] = registry.mintArtifact(
                    string.concat("ipfs://node-", vm.toString(level), "-", vm.toString(index)),
                    "kind",
                    keccak256(abi.encode(level, index)),
                    cites,
                    "owner",
                    proof
                );
            }
        }

        uint256 target = levels[depth - 1][0];
        ArtifactRegistry.Artifact memory data = registry.getArtifact(target);
        if (depth > 1) {
            assertEq(data.citations.length, width);
        } else {
            assertEq(data.citations.length, 0);
        }
    }
}

contract BadIdentity is IIdentityRegistry {
    function version() external pure override returns (uint256) {
        return 1;
    }

    function isAuthorizedAgent(address, string calldata, bytes32[] calldata) external pure override returns (bool) {
        return false;
    }

    function isAuthorizedValidator(address, string calldata, bytes32[] calldata) external pure override returns (bool) {
        return false;
    }

    function verifyAgent(address, string calldata, bytes32[] calldata)
        external
        pure
        override
        returns (bool, bytes32, bool, bool)
    {
        return (false, bytes32(0), false, false);
    }

    function verifyValidator(address, string calldata, bytes32[] calldata)
        external
        pure
        override
        returns (bool, bytes32, bool, bool)
    {
        return (false, bytes32(0), false, false);
    }

    function verifyNode(address, string calldata, bytes32[] calldata)
        external
        pure
        override
        returns (bool, bytes32, bool, bool)
    {
        return (false, bytes32(0), false, false);
    }

    function setENS(address) external pure override {}

    function setNameWrapper(address) external pure override {}

    function setReputationEngine(address) external pure override {}

    function setAgentRootNode(bytes32) external pure override {}

    function setClubRootNode(bytes32) external pure override {}

    function setNodeRootNode(bytes32) external pure override {}

    function setAgentMerkleRoot(bytes32) external pure override {}

    function setValidatorMerkleRoot(bytes32) external pure override {}

    function addAdditionalAgent(address) external pure override {}

    function removeAdditionalAgent(address) external pure override {}

    function addAdditionalValidator(address) external pure override {}

    function removeAdditionalValidator(address) external pure override {}

    function addAdditionalNodeOperator(address) external pure override {}

    function removeAdditionalNodeOperator(address) external pure override {}

    function setAgentType(address, AgentType) external pure override {}

    function additionalAgents(address) external pure override returns (bool) {
        return false;
    }

    function additionalValidators(address) external pure override returns (bool) {
        return false;
    }

    function additionalNodeOperators(address) external pure override returns (bool) {
        return false;
    }

    function getAgentType(address) external pure override returns (AgentType) {
        return AgentType.Human;
    }

    function setAgentProfileURI(address, string calldata) external pure override {}

    function updateAgentProfile(string calldata, bytes32[] calldata, string calldata) external pure override {}

    function agentProfileURI(address) external pure override returns (string memory) {
        return "";
    }
}
