// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "contracts/v2/FeePool.sol";
import "contracts/v2/modules/JobRouter.sol";
import "contracts/v2/interfaces/IStakeManager.sol";
import "contracts/v2/interfaces/IFeePool.sol";
import "contracts/v2/interfaces/IPlatformRegistry.sol";
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
    function acknowledgeAndDeposit(Role, uint256) external override {}
    function depositStakeFor(address, Role, uint256) external override {}
    function acknowledgeAndWithdraw(Role, uint256) external override {}
    function withdrawStake(Role, uint256) external override {}
    function lockJobFunds(bytes32, address, uint256) external override {}
    function releaseJobFunds(bytes32, address, uint256) external override {}
    function release(address, uint256) external override {}
    function finalizeJobFunds(bytes32, address, uint256, uint256, IFeePool) external override {}
    function distributeValidatorRewards(bytes32, uint256) external override {}
    function setDisputeModule(address) external override {}
    function setValidationModule(address) external override {}
    function lockDisputeFee(address, uint256) external override {}
    function payDisputeFee(address, uint256) external override {}
    function slash(address, Role, uint256, address) external override {}
    function slash(address, uint256, address) external override {}
    function setSlashPercentSumEnforcement(bool) external override {}
    function stakeOf(address user, Role role) external view override returns (uint256) {
        return stakes[user][role];
    }
    function totalStake(Role role) external view override returns (uint256) {
        return totals[role];
    }
}

contract IntegrationTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256('hevm cheat code')))));

    TestToken token;
    MockStakeManager stakeManager;
    MockPlatformRegistry registry;
    FeePool feePool;
    JobRouter router;

    address jobRegistryAddr = address(0x123);
    address platform1 = address(0x1);
    address platform2 = address(0x2);

    function setUp() public {
        token = new TestToken();
        stakeManager = new MockStakeManager();
        stakeManager.setJobRegistry(jobRegistryAddr);
        registry = new MockPlatformRegistry();
        feePool = new FeePool(token, stakeManager, 0, address(this));
        router = new JobRouter(registry, address(this));
    }

    function testLifecycle() public {
        setUp();
        stakeManager.setStake(platform1, IStakeManager.Role.Platform, 100);
        stakeManager.setStake(platform2, IStakeManager.Role.Platform, 200);
        registry.register(platform1, 100);
        registry.register(platform2, 200);
        vm.prank(platform1);
        router.register();
        vm.prank(platform2);
        router.register();
        router.selectPlatform(bytes32(uint256(1)));
        token.mint(address(feePool), 3000);
        vm.prank(address(stakeManager));
        feePool.depositFee(3000);
        feePool.distributeFees();
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
        vm.prank(address(stakeManager));
        feePool.depositFee(amount);
        feePool.distributeFees();
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

    function testFuzzRoutingFairness(uint64 st1, uint64 st2, bytes32 seed) public {
        setUp();
        uint256 score1 = uint256(st1 % 1e12);
        uint256 score2 = uint256(st2 % 1e12);
        if (score1 > 0) {
            registry.register(platform1, score1);
            vm.prank(platform1);
            router.register();
        }
        if (score2 > 0) {
            registry.register(platform2, score2);
            vm.prank(platform2);
            router.register();
        }
        address selected = router.selectPlatform(seed);
        uint256 weight1 = score1;
        uint256 weight2 = score2;
        if (weight1 + weight2 == 0) {
            require(selected == address(this), "none");
        } else {
            bytes32 bh = blockhash(block.number - 1);
            uint256 r = uint256(keccak256(abi.encodePacked(bh, seed))) % (weight1 + weight2);
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
        vm.prank(platform1);
        bool reverted;
        try feePool.setBurnPct(1) { reverted = false; } catch { reverted = true; }
        require(reverted, "only owner");
    }

    function testFeePoolReentrancy() public {
        setUp();
        stakeManager.setStake(platform1, IStakeManager.Role.Platform, 100);
        stakeManager.setStake(platform2, IStakeManager.Role.Platform, 200);
        ReentrantToken mal = new ReentrantToken(feePool);
        feePool.setToken(mal);
        mal.mint(address(feePool), 3000);
        vm.prank(address(stakeManager));
        feePool.depositFee(3000);
        feePool.distributeFees();
        mal.trigger();
        vm.prank(platform1);
        feePool.claimRewards();
        require(mal.balanceOf(platform1) == 1000, "reenter p1");
        require(mal.balanceOf(address(feePool)) == 2000, "reenter pool");
    }
}

