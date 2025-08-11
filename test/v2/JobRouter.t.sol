// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "contracts/v2/modules/JobRouter.sol";
import "contracts/v2/interfaces/IStakeManager.sol";
import "contracts/v2/interfaces/IFeePool.sol";

// minimal cheatcode interface
interface Vm {
    function prank(address) external;
}

contract MockStakeManager is IStakeManager {
    function depositStake(Role, uint256) external override {}
    function withdrawStake(Role, uint256) external override {}
    function lockJobFunds(bytes32, address, uint256) external override {}
    function releaseJobFunds(bytes32, address, uint256) external override {}
    function finalizeJobFunds(bytes32, address, uint256, uint256, IFeePool) external override {}
    function setDisputeModule(address) external override {}
    function lockDisputeFee(address, uint256) external override {}
    function payDisputeFee(address, uint256) external override {}
    function slash(address, Role, uint256, address) external override {}
    function setSlashPercentSumEnforcement(bool) external override {}

    mapping(address => mapping(Role => uint256)) public stakes;
    mapping(Role => uint256) public totals;

    function setStake(address user, Role role, uint256 amount) external {
        totals[role] = totals[role] - stakes[user][role] + amount;
        stakes[user][role] = amount;
    }

    function stakeOf(address user, Role role) external view override returns (uint256) {
        return stakes[user][role];
    }

    function totalStake(Role role) external view override returns (uint256) {
        return totals[role];
    }

    function jobRegistry() external pure override returns (address) {
        return address(0);
    }
}

contract JobRouterTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256('hevm cheat code')))));

    JobRouter router;
    MockStakeManager stakeManager;
    address platform1 = address(0x1);
    address platform2 = address(0x2);

    function setUp() public {
        stakeManager = new MockStakeManager();
        router = new JobRouter(stakeManager, address(this));
    }

    function registerPlatforms() internal {
        stakeManager.setStake(platform1, IStakeManager.Role.Platform, 100);
        stakeManager.setStake(platform2, IStakeManager.Role.Platform, 300);
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
        require(selected == address(0), "none");
    }

    function testRegisterRequiresStake() public {
        setUp();
        bool reverted;
        vm.prank(platform1);
        try router.register() { reverted = false; } catch { reverted = true; }
        require(reverted, "needs stake");
    }
}

