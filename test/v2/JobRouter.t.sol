// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "contracts/v2/JobRouter.sol";
import "contracts/v2/interfaces/IPlatformRegistry.sol";

// minimal cheatcode interface
interface Vm {
    function prank(address) external;
    function roll(uint256) external;
}

contract MockPlatformRegistry is IPlatformRegistry {
    mapping(address => bool) public registered;
    mapping(address => uint256) public scores;

    function register(address op, uint256 score) external {
        registered[op] = true;
        scores[op] = score;
    }

    function setScore(address op, uint256 score) external {
        scores[op] = score;
    }

    function getScore(address op) external view returns (uint256) {
        return registered[op] ? scores[op] : 0;
    }
}

contract JobRouterTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256('hevm cheat code')))));

    JobRouter router;
    MockPlatformRegistry registry;
    address platform1 = address(0x1);
    address platform2 = address(0x2);

    function setUp() public {
        registry = new MockPlatformRegistry();
        router = new JobRouter(registry);
    }

    function registerPlatforms() internal {
        registry.register(platform1, 100);
        registry.register(platform2, 300);
        vm.prank(platform1);
        router.register();
        vm.prank(platform2);
        router.register();
    }

    function testRoutingWeight() public {
        setUp();
        registerPlatforms();
        require(router.routingWeight(platform1) == 100e18 / 400, "w1");
        require(router.routingWeight(platform2) == 300e18 / 400, "w2");
    }

    function testDeterministicSelection() public {
        setUp();
        registerPlatforms();
        bytes32 seed = bytes32(uint256(123));
        address selected = router.selectPlatform(seed);
        uint256 rand = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), seed))) % 400;
        address expected = rand < 100 ? platform1 : platform2;
        require(selected == expected, "selection");
    }

    function testNoEligiblePlatforms() public {
        setUp();
        address selected = router.selectPlatform(bytes32(uint256(1)));
        require(selected == address(this), "none");
    }

    function testOwnerZeroStakeHasNoWeight() public {
        setUp();
        registry.register(address(this), 0);
        router.register();
        require(router.routingWeight(address(this)) == 0, "weight");
    }

    function testRegisterRequiresRegistration() public {
        setUp();
        bool reverted;
        vm.prank(platform1);
        try router.register() { reverted = false; } catch { reverted = true; }
        require(reverted, "needs registry");
    }

    function testReRegisterDoesNotDuplicateWeight() public {
        setUp();
        registerPlatforms();
        vm.prank(platform1);
        router.deregister();
        vm.roll(block.number + 1);
        vm.prank(platform1);
        router.register();
        require(router.routingWeight(platform1) == 100e18 / 400, "dup weight");
    }

    function testRegisterCooldown() public {
        setUp();
        registry.register(platform1, 100);
        vm.prank(platform1);
        router.register();
        vm.prank(platform1);
        router.deregister();
        bool reverted;
        vm.prank(platform1);
        try router.register() { reverted = false; } catch { reverted = true; }
        require(reverted, "cooldown not enforced");
        vm.roll(block.number + 1);
        vm.prank(platform1);
        router.register();
        require(router.routingWeight(platform1) == 1e18, "post cooldown");
    }
}

