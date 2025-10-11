// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/StdInvariant.sol";
import "forge-std/Test.sol";
import "forge-std/Vm.sol";

import {FeePool} from "../../../contracts/v2/FeePool.sol";
import {MockStakeManager} from "../../../contracts/legacy/MockV2.sol";
import {TaxPolicy} from "../../../contracts/v2/TaxPolicy.sol";
import {AGIALPHAToken} from "../../../contracts/test/AGIALPHAToken.sol";
import {IStakeManager} from "../../../contracts/v2/interfaces/IStakeManager.sol";
import {AGIALPHA} from "../../../contracts/v2/Constants.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

contract FeePoolHandler {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant MIN_TRANSFER = 1e15; // 0.001 AGIALPHA
    uint256 internal constant MAX_TRANSFER = 5_000e18;

    FeePool public immutable feePool;
    MockStakeManager public immutable stakeManager;
    AGIALPHAToken public immutable token;
    TaxPolicy public immutable taxPolicy;
    address public immutable tokenOwner;
    address public immutable governance;
    address public immutable treasury;

    address[] internal stakers;

    uint256 public maxCumulativePerToken;

    constructor(
        FeePool _feePool,
        MockStakeManager _stakeManager,
        AGIALPHAToken _token,
        TaxPolicy _taxPolicy,
        address[] memory _stakers,
        address _tokenOwner,
        address _governance,
        address _treasury
    ) {
        feePool = _feePool;
        stakeManager = _stakeManager;
        token = _token;
        taxPolicy = _taxPolicy;
        stakers = _stakers;
        tokenOwner = _tokenOwner;
        governance = _governance;
        treasury = _treasury;
        maxCumulativePerToken = _feePool.cumulativePerToken();

        // Prime tax acknowledgements for all actors interacting with the pool.
        _acknowledge(address(_stakeManager));
        _acknowledge(_governance);
        uint256 len = stakers.length;
        for (uint256 i; i < len; ++i) {
            _acknowledge(stakers[i]);
        }
    }

    function depositFees(uint96 rawAmount) external {
        uint256 amount = _boundAmount(rawAmount);
        vm.startPrank(tokenOwner);
        token.mint(address(feePool), amount);
        vm.stopPrank();

        vm.prank(address(stakeManager));
        feePool.depositFee(amount);
        _recordCumulative();
    }

    function contribute(uint96 rawAmount, uint8 who) external {
        address user = stakers[who % stakers.length];
        uint256 amount = _boundAmount(rawAmount);

        vm.startPrank(tokenOwner);
        token.mint(user, amount);
        vm.stopPrank();

        _acknowledge(user);

        vm.startPrank(user);
        token.approve(address(feePool), amount);
        feePool.contribute(amount);
        vm.stopPrank();
        _recordCumulative();
    }

    function distribute(uint8 whoCalls) external {
        address caller = stakers[whoCalls % stakers.length];
        _acknowledge(caller);
        vm.prank(caller);
        feePool.distributeFees();
        _recordCumulative();
    }

    function claim(uint8 who) external {
        address user = stakers[who % stakers.length];
        _acknowledge(user);
        vm.prank(user);
        feePool.claimRewards();
        _recordCumulative();
    }

    function governanceWithdraw(uint96 rawAmount, bool toTreasury) external {
        uint256 balance = token.balanceOf(address(feePool));
        uint256 pending = feePool.pendingFees();
        if (balance <= pending) return;

        uint256 available = balance - pending;
        uint256 amount = _boundAmount(rawAmount) % available;
        if (amount == 0) {
            amount = available;
        }

        address recipient = toTreasury && treasury != address(0) ? treasury : address(0);

        _acknowledge(governance);
        vm.prank(governance);
        feePool.governanceWithdraw(recipient, amount);
        _recordCumulative();
    }

    function reward(uint96 rawAmount, uint8 who, bool sendTreasury) external {
        uint256 balance = token.balanceOf(address(feePool));
        uint256 pending = feePool.pendingFees();
        if (balance <= pending) return;

        uint256 available = balance - pending;
        uint256 amount = _boundAmount(rawAmount) % available;
        if (amount == 0) {
            amount = available;
        }

        address recipient = sendTreasury && treasury != address(0) ? treasury : stakers[who % stakers.length];
        feePool.reward(recipient, amount);
        _recordCumulative();
    }

    function rebalanceStake(uint8 who, uint96 rawAmount) external {
        address user = stakers[who % stakers.length];
        uint256 amount = MIN_TRANSFER + (uint256(rawAmount) % (MAX_TRANSFER * 2));
        stakeManager.setStake(user, IStakeManager.Role.Platform, amount);
        _recordCumulative();
    }

    function _recordCumulative() internal {
        uint256 current = feePool.cumulativePerToken();
        if (current > maxCumulativePerToken) {
            maxCumulativePerToken = current;
        }
    }

    function _boundAmount(uint96 rawAmount) internal pure returns (uint256) {
        uint256 amount = MIN_TRANSFER + (uint256(rawAmount) % MAX_TRANSFER);
        return amount;
    }

    function _acknowledge(address user) internal {
        if (!taxPolicy.hasAcknowledged(user)) {
            vm.prank(user);
            taxPolicy.acknowledge();
        }
    }
}

contract FeePoolInvariantTest is StdInvariant, Test {
    FeePool public feePool;
    MockStakeManager public stakeManager;
    TaxPolicy public taxPolicy;
    AGIALPHAToken public token;
    TimelockController public governance;
    FeePoolHandler public handler;

    address public constant TREASURY = address(0xCAFE);

    function setUp() public {
        AGIALPHAToken impl = new AGIALPHAToken();
        vm.etch(AGIALPHA, address(impl).code);
        vm.store(AGIALPHA, bytes32(uint256(5)), bytes32(uint256(uint160(address(this)))));
        token = AGIALPHAToken(payable(AGIALPHA));

        stakeManager = new MockStakeManager();
        stakeManager.setJobRegistry(address(0x1234));

        taxPolicy = new TaxPolicy("ipfs://policy", "ack");

        feePool = new FeePool(stakeManager, 2, TREASURY, taxPolicy);

        // Mirror the production requirement where contracts that transfer
        // AGIALPHA acknowledge the token terms after deployment. Without this
        // step the mock pool cannot send rewards during invariant executions.
        vm.prank(address(feePool));
        token.acceptTerms();

        address[] memory proposers = new address[](1);
        proposers[0] = address(this);
        address[] memory executors = new address[](1);
        executors[0] = address(this);
        governance = new TimelockController(0, proposers, executors, address(this));

        feePool.setGovernance(address(governance));
        feePool.setTreasuryAllowlist(TREASURY, true);
        feePool.setRewarder(address(this), true);

        address[] memory stakers = new address[](3);
        stakers[0] = address(0xA11CE);
        stakers[1] = address(0xB0B);
        stakers[2] = address(0xC0FFEE);

        for (uint256 i; i < stakers.length; ++i) {
            stakeManager.setStake(stakers[i], IStakeManager.Role.Platform, 1_000e18);
        }

        handler = new FeePoolHandler(
            feePool,
            stakeManager,
            token,
            taxPolicy,
            stakers,
            address(this),
            address(governance),
            TREASURY
        );

        feePool.setRewarder(address(handler), true);

        targetContract(address(handler));
    }

    function invariant_pendingFeesBackedByBalance() public view {
        uint256 balance = token.balanceOf(address(feePool));
        assertGe(balance, feePool.pendingFees(), "pending fees exceed backing");
    }

    function invariant_cumulativePerTokenMonotonic() public view {
        assertGe(
            feePool.cumulativePerToken(),
            handler.maxCumulativePerToken(),
            "cumulativePerToken decreased"
        );
    }

    function invariant_treasuryRewardsAccounted() public view {
        uint256 tracked = feePool.treasuryRewards(TREASURY);
        uint256 balance = token.balanceOf(TREASURY);
        assertLe(tracked, balance, "treasury rewards exceed balance");
    }
}
