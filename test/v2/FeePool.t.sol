// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "contracts/v2/FeePool.sol";
import "contracts/v2/interfaces/IFeePool.sol";
import "contracts/legacy/MockV2.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AGIALPHA} from "contracts/v2/Constants.sol";

// minimal cheatcode interface
interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function etch(address, bytes memory) external;
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
        TestToken impl = new TestToken();
        vm.etch(AGIALPHA, address(impl).code);
        token = TestToken(AGIALPHA);
        stakeManager = new MockStakeManager();
        stakeManager.setJobRegistry(jobRegistry);
        feePool = new FeePool(stakeManager, 0, address(this));
        stakeManager.setStake(alice, IStakeManager.Role.Platform, 1 * TOKEN);
        stakeManager.setStake(bob, IStakeManager.Role.Platform, 2 * TOKEN);
    }

    function testDepositFee() public {
        setUp();
        token.mint(address(feePool), 1 * TOKEN);
        vm.prank(address(stakeManager));
        feePool.depositFee(1 * TOKEN);
        feePool.distributeFees();
        uint256 expected = feePool.ACCUMULATOR_SCALE() / 3;
        require(feePool.cumulativePerToken() == expected, "acc");
        require(token.balanceOf(address(feePool)) == 1 * TOKEN, "bal");
    }

    function testContribute() public {
        setUp();
        token.mint(alice, TOKEN / 2);
        vm.startPrank(alice);
        token.approve(address(feePool), TOKEN / 2);
        feePool.contribute(TOKEN / 2);
        vm.stopPrank();
        require(token.balanceOf(address(feePool)) == TOKEN / 2, "pool bal");
        require(feePool.pendingFees() == TOKEN / 2, "pending");
    }

    function testClaimRewards() public {
        setUp();
        token.mint(address(feePool), 3 * TOKEN);
        vm.prank(address(stakeManager));
        feePool.depositFee(3 * TOKEN);
        feePool.distributeFees();
        vm.prank(alice);
        feePool.claimRewards();
        vm.prank(bob);
        feePool.claimRewards();
        uint256 aliceExpected = TOKEN;
        uint256 bobExpected = 2 * TOKEN;
        require(token.balanceOf(alice) == aliceExpected, "alice claim");
        require(token.balanceOf(bob) == bobExpected, "bob claim");
    }

    /// @notice ensures rewards distribute precisely with 18-decimal tokens
    function testDistributionPrecision() public {
        setUp();
        token.mint(address(feePool), 1 * TOKEN);
        vm.prank(address(stakeManager));
        feePool.depositFee(1 * TOKEN);
        feePool.distributeFees();
        vm.prank(alice);
        feePool.claimRewards();
        vm.prank(bob);
        feePool.claimRewards();
        require(token.balanceOf(alice) == 333_333_333_333_333_333, "alice");
        require(token.balanceOf(bob) == 666_666_666_666_666_666, "bob");
        // one wei of rounding dust remains in the contract
        require(
            token.balanceOf(alice) + token.balanceOf(bob) == TOKEN - 1,
            "sum"
        );
    }
}

