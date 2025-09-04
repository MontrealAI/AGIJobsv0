// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {StakeManager} from "contracts/v2/StakeManager.sol";
import {FeePool} from "contracts/v2/FeePool.sol";
import {PaymentRouter} from "contracts/v2/PaymentRouter.sol";
import {MockJobRegistry} from "contracts/legacy/MockV2.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IStakeManager} from "contracts/v2/interfaces/IStakeManager.sol";
import {AGIALPHA} from "contracts/v2/Constants.sol";

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
    function burn(uint256 amount) external { _burn(msg.sender, amount); }
}

contract PaymentRouterTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256('hevm cheat code')))));

    StakeManager stakeManager;
    FeePool feePool;
    PaymentRouter router;
    MockJobRegistry jobRegistry;
    TestToken token1;
    TestToken token2;

    address constant TREASURY = address(0xBEEF);
    uint256 constant TOKEN = 1e18;

    function setUp() public {
        // deploy test token at AGIALPHA address
        TestToken impl = new TestToken();
        vm.etch(AGIALPHA, address(impl).code);
        token1 = TestToken(AGIALPHA);
        token2 = new TestToken();

        router = new PaymentRouter(IERC20(address(token1)));

        jobRegistry = new MockJobRegistry();
        // token2 irrelevant for registry
        stakeManager = new StakeManager({
            _minStake: 0,
            _employerSlashPct: 0,
            _treasurySlashPct: 100,
            _treasury: TREASURY,
            _jobRegistry: address(jobRegistry),
            _disputeModule: address(0),
            _timelock: address(this)
        });
        feePool = new FeePool(IStakeManager(address(stakeManager)), 0, TREASURY);

        stakeManager.setPaymentRouter(address(router));
        feePool.setPaymentRouter(address(router));
    }

    function testRouterUpdateAndTransfer() public {
        // initial staking with token1
        token1.mint(address(this), TOKEN);
        token1.approve(address(stakeManager), TOKEN);
        stakeManager.depositStake(StakeManager.Role.Agent, TOKEN);
        stakeManager.withdrawStake(StakeManager.Role.Agent, TOKEN);
        require(token1.balanceOf(address(this)) == TOKEN, "token1 returned");

        // fee pool distribution with token1
        token1.mint(address(feePool), TOKEN);
        vm.prank(address(stakeManager));
        feePool.depositFee(TOKEN);
        uint256 before1 = token1.balanceOf(TREASURY);
        feePool.distributeFees();
        require(token1.balanceOf(TREASURY) > before1, "treasury received token1");

        // update router to new token
        router.setToken(IERC20(address(token2)));
        stakeManager.setPaymentRouter(address(router));
        feePool.setPaymentRouter(address(router));

        // staking with token2
        token2.mint(address(this), TOKEN);
        token2.approve(address(stakeManager), TOKEN);
        stakeManager.depositStake(StakeManager.Role.Agent, TOKEN);
        stakeManager.withdrawStake(StakeManager.Role.Agent, TOKEN);
        require(token2.balanceOf(address(this)) == TOKEN, "token2 returned");

        // fee pool distribution with token2
        token2.mint(address(feePool), TOKEN);
        vm.prank(address(stakeManager));
        feePool.depositFee(TOKEN);
        uint256 before2 = token2.balanceOf(TREASURY);
        feePool.distributeFees();
        require(token2.balanceOf(TREASURY) > before2, "treasury received token2");
    }
}

