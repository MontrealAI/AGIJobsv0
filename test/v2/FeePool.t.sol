// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "contracts/v2/FeePool.sol";
import "contracts/v2/interfaces/IFeePool.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// minimal cheatcode interface
interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
}

contract TestToken is ERC20 {
    constructor() ERC20("Test", "TST") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract MockStakeManager is IStakeManager {
    mapping(address => uint256) public stakes;
    uint256 public totalStakeAmount;
    address public override jobRegistry;

    function setJobRegistry(address j) external { jobRegistry = j; }

    function setStake(address user, uint256 amount) external {
        totalStakeAmount = totalStakeAmount - stakes[user] + amount;
        stakes[user] = amount;
    }

    function depositStake(Role, uint256) external override {}
    function acknowledgeAndDeposit(Role, uint256) external override {}
    function depositStakeFor(address, Role, uint256) external override {}
    function acknowledgeAndWithdraw(Role, uint256) external override {}
    function withdrawStake(Role, uint256) external override {}
    function lockJobFunds(bytes32, address, uint256) external override {}
    function releaseJobFunds(bytes32, address, uint256) external override {}
    function finalizeJobFunds(bytes32, address, uint256, uint256, IFeePool) external override {}
    function setDisputeModule(address) external override {}
    function lockDisputeFee(address, uint256) external override {}
    function payDisputeFee(address, uint256) external override {}
    function slash(address, Role, uint256, address) external override {}
    function setSlashPercentSumEnforcement(bool) external override {}

    function totalStake(Role) external view override returns (uint256) {
        return totalStakeAmount;
    }

    function stakeOf(address user, Role) external view override returns (uint256) {
        return stakes[user];
    }
}

contract FeePoolTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256('hevm cheat code')))));

    FeePool feePool;
    TestToken token;
    MockStakeManager stakeManager;
    address jobRegistry = address(0x123);
    address alice = address(0xA1);
    address bob = address(0xB2);

    function setUp() public {
        token = new TestToken();
        stakeManager = new MockStakeManager();
        stakeManager.setJobRegistry(jobRegistry);
        feePool = new FeePool(token, stakeManager, IStakeManager.Role.Validator, address(this));
        stakeManager.setStake(alice, 1_000_000);
        stakeManager.setStake(bob, 2_000_000);
    }

    function testDepositFee() public {
        setUp();
        token.mint(address(feePool), 1_000_000);
        vm.prank(address(stakeManager));
        feePool.depositFee(1_000_000);
        feePool.distributeFees();
        uint256 expected = 1_000_000 * feePool.ACCUMULATOR_SCALE() / 3_000_000;
        require(feePool.cumulativePerToken() == expected, "acc");
        require(token.balanceOf(address(feePool)) == 1_000_000, "bal");
    }

    function testClaimRewards() public {
        setUp();
        token.mint(address(feePool), 1_500_000);
        vm.prank(address(stakeManager));
        feePool.depositFee(1_500_000);
        feePool.distributeFees();
        vm.prank(alice);
        feePool.claimRewards();
        vm.prank(bob);
        feePool.claimRewards();
        uint256 aliceExpected = 1_500_000 * 1_000_000 / 3_000_000;
        uint256 bobExpected = 1_500_000 * 2_000_000 / 3_000_000;
        require(token.balanceOf(alice) == aliceExpected, "alice claim");
        require(token.balanceOf(bob) == bobExpected, "bob claim");
    }

    function testTokenSwitch() public {
        setUp();
        TestToken token2 = new TestToken();
        vm.prank(address(this));
        feePool.setToken(token2);
        token2.mint(address(feePool), 1_000_000);
        vm.prank(address(stakeManager));
        feePool.depositFee(1_000_000);
        feePool.distributeFees();
        vm.prank(alice);
        feePool.claimRewards();
        require(token2.balanceOf(alice) == 333_333, "switch");
    }

    function testPrecisionSixDecimals() public {
        setUp();
        token.mint(address(feePool), 1_000_000);
        vm.prank(address(stakeManager));
        feePool.depositFee(1_000_000);
        feePool.distributeFees();
        vm.prank(alice);
        feePool.claimRewards();
        vm.prank(bob);
        feePool.claimRewards();
        require(token.balanceOf(alice) == 333_333, "alice");
        require(token.balanceOf(bob) == 666_666, "bob");
        require(token.balanceOf(alice) + token.balanceOf(bob) == 999_999, "sum");
    }
}

