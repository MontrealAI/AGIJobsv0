// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "contracts/v2/FeePool.sol";
import "contracts/v2/interfaces/IFeePool.sol";
import "contracts/legacy/MockV2.sol";
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
        feePool = new FeePool(token, stakeManager, 0, address(this));
        feePool.setRewardRole(IStakeManager.Role.Validator);
        stakeManager.setStake(alice, IStakeManager.Role.Platform, 1_000_000);
        stakeManager.setStake(bob, IStakeManager.Role.Platform, 2_000_000);
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

    function testContribute() public {
        setUp();
        token.mint(alice, 500_000);
        vm.startPrank(alice);
        token.approve(address(feePool), 500_000);
        feePool.contribute(500_000);
        vm.stopPrank();
        require(token.balanceOf(address(feePool)) == 500_000, "pool bal");
        require(feePool.pendingFees() == 500_000, "pending");
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

