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
    function decimals() public pure override returns (uint8) { return 18; }
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

    uint256 constant TOKEN = 1e18;

    function setUp() public {
        token = new TestToken();
        stakeManager = new MockStakeManager();
        stakeManager.setJobRegistry(jobRegistry);
        feePool = new FeePool(stakeManager, 0, address(this));
        feePool.setRewardRole(IStakeManager.Role.Validator);
        stakeManager.setStake(alice, IStakeManager.Role.Platform, 1_000_000 * TOKEN);
        stakeManager.setStake(bob, IStakeManager.Role.Platform, 2_000_000 * TOKEN);
    }

    function testDepositFee() public {
        setUp();
        token.mint(address(feePool), 1_000_000 * TOKEN);
        vm.prank(address(stakeManager));
        feePool.depositFee(1_000_000 * TOKEN);
        feePool.distributeFees();
        uint256 expected = 1_000_000 * feePool.ACCUMULATOR_SCALE() / 3_000_000;
        require(feePool.cumulativePerToken() == expected, "acc");
        require(token.balanceOf(address(feePool)) == 1_000_000 * TOKEN, "bal");
    }

    function testContribute() public {
        setUp();
        token.mint(alice, 500_000 * TOKEN);
        vm.startPrank(alice);
        token.approve(address(feePool), 500_000 * TOKEN);
        feePool.contribute(500_000 * TOKEN);
        vm.stopPrank();
        require(token.balanceOf(address(feePool)) == 500_000 * TOKEN, "pool bal");
        require(feePool.pendingFees() == 500_000 * TOKEN, "pending");
    }

    function testClaimRewards() public {
        setUp();
        token.mint(address(feePool), 1_500_000 * TOKEN);
        vm.prank(address(stakeManager));
        feePool.depositFee(1_500_000 * TOKEN);
        feePool.distributeFees();
        vm.prank(alice);
        feePool.claimRewards();
        vm.prank(bob);
        feePool.claimRewards();
        uint256 aliceExpected = (1_500_000 * TOKEN) * (1_000_000 * TOKEN) / (3_000_000 * TOKEN);
        uint256 bobExpected = (1_500_000 * TOKEN) * (2_000_000 * TOKEN) / (3_000_000 * TOKEN);
        require(token.balanceOf(alice) == aliceExpected, "alice claim");
        require(token.balanceOf(bob) == bobExpected, "bob claim");
    }

    function testPrecisionSixDecimals() public {
        setUp();
        token.mint(address(feePool), 1_000_000 * TOKEN);
        vm.prank(address(stakeManager));
        feePool.depositFee(1_000_000 * TOKEN);
        feePool.distributeFees();
        vm.prank(alice);
        feePool.claimRewards();
        vm.prank(bob);
        feePool.claimRewards();
        require(token.balanceOf(alice) == 333_333_333_333_333_333_333_333, "alice");
        require(token.balanceOf(bob) == 666_666_666_666_666_666_666_666, "bob");
        require(
            token.balanceOf(alice) + token.balanceOf(bob) == 1_000_000 * TOKEN - 1,
            "sum"
        );
    }
}

