// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "contracts/v2/FeePool.sol";
import "contracts/v2/modules/JobRouter.sol";
import "contracts/v2/interfaces/IStakeManager.sol";
import "contracts/v2/interfaces/IReputationEngine.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function prevrandao(bytes32) external;
}

contract TestToken is ERC20 {
    constructor() ERC20("Test", "TST") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract ReentrantToken is ERC20 {
    FeePool feePool;
    bool attack;
    constructor(FeePool _feePool) ERC20("Mal", "MAL") { feePool = _feePool; }
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function trigger() external { attack = true; }
    function transfer(address to, uint256 amount) public override returns (bool) {
        bool ok = super.transfer(to, amount);
        if (attack && msg.sender == address(feePool)) {
            attack = false;
            feePool.claimRewards();
        }
        return ok;
    }
}

contract MockStakeManager is IStakeManager {
    mapping(address => mapping(Role => uint256)) public stakes;
    mapping(Role => uint256) public totals;
    address public jobRegistry;
    function setJobRegistry(address j) external { jobRegistry = j; }
    function setStake(address user, Role role, uint256 amount) external {
        totals[role] = totals[role] - stakes[user][role] + amount;
        stakes[user][role] = amount;
    }
    function depositStake(Role, uint256) external override {}
    function withdrawStake(Role, uint256) external override {}
    function lockJobFunds(bytes32, address, uint256) external override {}
    function releaseJobFunds(bytes32, address, uint256) external override {}
    function setDisputeModule(address) external override {}
    function lockDisputeFee(address, uint256) external override {}
    function payDisputeFee(address, uint256) external override {}
    function slash(address, Role, uint256, address) external override {}
    function setSlashPercentSumEnforcement(bool) external override {}
    function stakeOf(address user, Role role) external view override returns (uint256) {
        return stakes[user][role];
    }
    function totalStake(Role role) external view override returns (uint256) {
        return totals[role];
    }
}

contract MockReputationEngine is IReputationEngine {
    mapping(address => bool) public blacklist;
    mapping(address => uint256) public reps;
    function add(address, uint256) external override {}
    function subtract(address, uint256) external override {}
    function setCaller(address, bool) external override {}
    function setThreshold(uint256) external override {}
    function setBlacklist(address user, bool b) external override { blacklist[user] = b; }
    function isBlacklisted(address user) external view override returns (bool) { return blacklist[user]; }
    function setReputation(address user, uint256 amount) external { reps[user] = amount; }
    function reputation(address user) external view override returns (uint256) { return reps[user]; }
    function getOperatorScore(address user) external view override returns (uint256) { return reps[user]; }
    function setStakeManager(address) external override {}
    function setScoringWeights(uint256, uint256) external override {}
}

contract IntegrationTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256('hevm cheat code')))));

    TestToken token;
    MockStakeManager stakeManager;
    MockReputationEngine repEngine;
    FeePool feePool;
    JobRouter router;

    address jobRegistryAddr = address(0x123);
    address platform1 = address(0x1);
    address platform2 = address(0x2);

    function setUp() public {
        token = new TestToken();
        stakeManager = new MockStakeManager();
        stakeManager.setJobRegistry(jobRegistryAddr);
        repEngine = new MockReputationEngine();
        feePool = new FeePool(token, stakeManager, IStakeManager.Role.Platform, address(this));
        router = new JobRouter(stakeManager, repEngine, address(this));
        router.setMinStake(1);
        stakeManager.setStake(platform1, IStakeManager.Role.Platform, 100);
        stakeManager.setStake(platform2, IStakeManager.Role.Platform, 200);
        repEngine.setReputation(platform1, 1);
        repEngine.setReputation(platform2, 3);
        router.registerPlatform(platform1);
        router.registerPlatform(platform2);
    }

    function testLifecycle() public {
        setUp();
        bytes32 jobId = bytes32(uint256(1));
        vm.prevrandao(bytes32(uint256(1)));
        router.selectPlatform(jobId);
        token.mint(address(feePool), 3000);
        vm.prank(jobRegistryAddr);
        feePool.depositFee(3000);
        vm.prank(platform1);
        feePool.claimRewards();
        vm.prank(platform2);
        feePool.claimRewards();
        require(token.balanceOf(platform1) == 1000, "p1");
        require(token.balanceOf(platform2) == 2000, "p2");
    }

    function testFuzzRewardDistribution(uint64 s1, uint64 s2, uint64 fee) public {
        setUp();
        uint256 stake1 = uint256(s1 % 1e12) + 1;
        uint256 stake2 = uint256(s2 % 1e12) + 1;
        uint256 amount = uint256(fee % 1e12) + 1;
        stakeManager.setStake(platform1, IStakeManager.Role.Platform, stake1);
        stakeManager.setStake(platform2, IStakeManager.Role.Platform, stake2);
        token.mint(address(feePool), amount);
        vm.prank(jobRegistryAddr);
        feePool.depositFee(amount);
        vm.prank(platform1);
        feePool.claimRewards();
        vm.prank(platform2);
        feePool.claimRewards();
        uint256 expected1 = amount * stake1 / (stake1 + stake2);
        uint256 bal1 = token.balanceOf(platform1);
        uint256 bal2 = token.balanceOf(platform2);
        require(bal1 + 1 >= expected1 && expected1 + 1 >= bal1, "fuzz1");
        require(bal1 + bal2 + token.balanceOf(address(feePool)) == amount, "sum");
    }

    function testFuzzRoutingFairness(uint64 st1, uint64 rp1, uint64 st2, uint64 rp2, bytes32 jobId, bytes32 rand) public {
        setUp();
        uint256 stake1 = uint256(st1 % 1e12);
        uint256 stake2 = uint256(st2 % 1e12);
        uint256 rep1 = uint256(rp1 % 1e6);
        uint256 rep2 = uint256(rp2 % 1e6);
        stakeManager.setStake(platform1, IStakeManager.Role.Platform, stake1);
        stakeManager.setStake(platform2, IStakeManager.Role.Platform, stake2);
        repEngine.setReputation(platform1, rep1);
        repEngine.setReputation(platform2, rep2);
        vm.prevrandao(rand);
        address selected = router.selectPlatform(jobId);
        uint256 weight1 = stake1 * rep1;
        uint256 weight2 = stake2 * rep2;
        if (weight1 + weight2 == 0) {
            require(selected == address(0), "none");
        } else {
            uint256 r = uint256(keccak256(abi.encodePacked(jobId, rand))) % (weight1 + weight2);
            address expected = r < weight1 ? platform1 : platform2;
            require(selected == expected, "fair");
        }
    }

    function testOwnerReconfigure() public {
        setUp();
        TestToken token2 = new TestToken();
        feePool.setToken(token2);
        feePool.setRewardRole(IStakeManager.Role.Validator);
        feePool.setStakeManager(stakeManager);
        feePool.setBurnPct(5);
        router.setMinStake(10);
        router.setStakeWeighting(2e18);
        router.setStakeManager(stakeManager);
        router.setReputationEngine(repEngine);
        vm.prank(platform1);
        bool reverted;
        try feePool.setBurnPct(1) { reverted = false; } catch { reverted = true; }
        require(reverted, "only owner");
    }

    function testFeePoolReentrancy() public {
        setUp();
        ReentrantToken mal = new ReentrantToken(feePool);
        feePool.setToken(mal);
        mal.mint(address(feePool), 3000);
        vm.prank(jobRegistryAddr);
        feePool.depositFee(3000);
        mal.trigger();
        vm.prank(platform1);
        feePool.claimRewards();
        require(mal.balanceOf(platform1) == 1000, "reenter p1");
        require(mal.balanceOf(address(feePool)) == 2000, "reenter pool");
    }
}

