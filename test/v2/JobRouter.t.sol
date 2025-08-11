// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "contracts/v2/modules/JobRouter.sol";
import "contracts/v2/interfaces/IStakeManager.sol";
import "contracts/v2/interfaces/IReputationEngine.sol";
import "contracts/v2/interfaces/IFeePool.sol";

// minimal cheatcode interface
interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function prevrandao(bytes32) external;
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
    mapping(Role => uint256) public totalStakes;
    address public jobRegistryAddr;

    function setJobRegistry(address j) external { jobRegistryAddr = j; }

    function setStake(address user, Role role, uint256 amount) external {
        totalStakes[role] = totalStakes[role] - stakes[user][role] + amount;
        stakes[user][role] = amount;
    }
    function stakeOf(address user, Role role) external view override returns (uint256) {
        return stakes[user][role];
    }
    function totalStake(Role role) external view override returns (uint256) {
        return totalStakes[role];
    }
    function jobRegistry() external view override returns (address) {
        return jobRegistryAddr;
    }
}

contract MockReputationEngine is IReputationEngine {
    function add(address, uint256) external override {}
    function subtract(address, uint256) external override {}
    function setCaller(address, bool) external override {}
    function setThreshold(uint256) external override {}

    mapping(address => bool) public blacklist;
    function setBlacklist(address user, bool b) external override {
        blacklist[user] = b;
    }
    function isBlacklisted(address user) external view override returns (bool) {
        return blacklist[user];
    }

    mapping(address => uint256) public reps;
    function setReputation(address user, uint256 amount) external {
        reps[user] = amount;
    }
    function reputation(address user) external view override returns (uint256) {
        return reps[user];
    }
    function getReputation(address user) external view override returns (uint256) {
        return reps[user];
    }
    function getOperatorScore(address user) external view override returns (uint256) {
        return reps[user];
    }
    function setStakeManager(address) external override {}
    function setScoringWeights(uint256, uint256) external override {}
}

contract JobRouterTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256('hevm cheat code')))));

    JobRouter router;
    MockStakeManager stakeManager;
    MockReputationEngine repEngine;
    address platform1 = address(0x1);
    address platform2 = address(0x2);

    function setUp() public {
        stakeManager = new MockStakeManager();
        repEngine = new MockReputationEngine();
        router = new JobRouter(stakeManager, repEngine, address(this));
        router.setMinStake(50);
        stakeManager.setStake(platform1, IStakeManager.Role.Platform, 100);
        stakeManager.setStake(platform2, IStakeManager.Role.Platform, 100);
        repEngine.setReputation(platform1, 1);
        repEngine.setReputation(platform2, 3);
        router.registerPlatform(platform1);
        router.registerPlatform(platform2);
    }

    function testRoutingScore() public {
        setUp();
        require(router.getRoutingScore(platform1) == 100, "score1");
        require(router.getRoutingScore(platform2) == 300, "score2");
    }

    function testDeterministicSelection() public {
        setUp();
        bytes32 jobId = bytes32(uint256(123));
        vm.prevrandao(bytes32(uint256(1)));
        address selected = router.selectPlatform(jobId);
        uint256 totalWeight = 100 + 300; // weights based on stake and reputation
        uint256 rand = uint256(keccak256(abi.encodePacked(jobId, bytes32(uint256(1))))) % totalWeight;
        address expected = rand < 100 ? platform1 : platform2;
        require(selected == expected, "selection mismatch");
        require(router.routingHistory(jobId) == expected, "history");
    }

    function testNoEligiblePlatforms() public {
        stakeManager.setStake(platform1, IStakeManager.Role.Platform, 0);
        stakeManager.setStake(platform2, IStakeManager.Role.Platform, 0);
        vm.prevrandao(bytes32(uint256(1)));
        address selected = router.selectPlatform(bytes32(uint256(1)));
        require(selected == address(0), "should return zero");
    }

    function testBlacklistBlocksRegistration() public {
        repEngine.setBlacklist(platform1, true);
        bool reverted;
        try router.registerPlatform(platform1) {
            reverted = false;
        } catch {
            reverted = true;
        }
        require(reverted, "should revert");
    }
}

