// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/StdInvariant.sol";
import "forge-std/Test.sol";
import "forge-std/StdCheats.sol";

import {FeePool} from "../../../contracts/v2/FeePool.sol";
import {MockStakeManager} from "../../../contracts/legacy/MockV2.sol";
import {AGIALPHAToken} from "../../../contracts/test/AGIALPHAToken.sol";
import {ITaxPolicy} from "../../../contracts/v2/interfaces/ITaxPolicy.sol";
import {IStakeManager} from "../../../contracts/v2/interfaces/IStakeManager.sol";
import {AGIALPHA} from "../../../contracts/v2/Constants.sol";

contract FeePoolInvariantHandler is StdCheats {
    FeePool public immutable feePool;
    MockStakeManager public immutable stakeManager;
    AGIALPHAToken public immutable token;

    address[] public stakers;
    address public treasury;

    bool private bootstrapped;
    uint256 private maxCumulative;

    constructor(FeePool _feePool, MockStakeManager _stakeManager, AGIALPHAToken _token) {
        feePool = _feePool;
        stakeManager = _stakeManager;
        token = _token;

        stakers.push(address(0xA11CE));
        stakers.push(address(0xB0B));
        stakers.push(address(0xC0FFEE));
        stakers.push(address(0xD00D));
    }

    function bootstrap() external {
        if (bootstrapped) return;
        bootstrapped = true;

        treasury = address(0x900D);
        feePool.setTreasuryAllowlist(treasury, true);
        feePool.setTreasury(treasury);
        feePool.setRewarder(address(this), true);
        feePool.setPauser(address(this));

        uint256 base = 1e18;
        for (uint256 i; i < stakers.length; ++i) {
            stakeManager.setStake(stakers[i], IStakeManager.Role.Platform, base * (i + 1));
        }

        _afterAction();
    }

    function depositFees(uint96 rawAmount) external {
        if (!bootstrapped) return;
        uint256 amount = bound(uint256(rawAmount), 1e16, 1_000e18);
        token.mint(address(feePool), amount);
        vm.prank(address(stakeManager));
        feePool.depositFee(amount);
        _afterAction();
    }

    function contribute(uint8 who, uint96 rawAmount) external {
        if (!bootstrapped || feePool.paused()) return;
        address user = stakers[who % stakers.length];
        uint256 amount = bound(uint256(rawAmount), 1e16, 500e18);
        token.mint(user, amount);
        vm.startPrank(user);
        token.approve(address(feePool), amount);
        feePool.contribute(amount);
        vm.stopPrank();
        _afterAction();
    }

    function claim(uint8 who) external {
        if (!bootstrapped || feePool.paused()) return;
        address user = stakers[who % stakers.length];
        vm.prank(user);
        try feePool.claimRewards() {
            _afterAction();
        } catch {}
    }

    function distribute(uint8 callerIndex) external {
        if (!bootstrapped || feePool.paused()) return;
        address caller = stakers[callerIndex % stakers.length];
        vm.prank(caller);
        feePool.distributeFees();
        _afterAction();
    }

    function donateIdle(uint96 rawAmount) external {
        if (!bootstrapped) return;
        uint256 amount = bound(uint256(rawAmount), 1e16, 250e18);
        token.mint(address(feePool), amount);
        _afterAction();
    }

    function reward(uint8 toIndex, uint96 rawAmount) external {
        if (!bootstrapped || feePool.paused()) return;
        uint256 balance = token.balanceOf(address(feePool));
        uint256 pending = feePool.pendingFees();
        if (balance <= pending) return;
        uint256 available = balance - pending;
        if (available == 0) return;
        uint256 amount = bound(uint256(rawAmount), 1, available);
        address recipient;
        if (toIndex % (stakers.length + 1) == stakers.length) {
            if (treasury == address(0)) {
                return;
            }
            recipient = treasury;
        } else {
            recipient = stakers[toIndex % stakers.length];
        }
        if (recipient == address(0)) return;
        feePool.reward(recipient, amount);
        _afterAction();
    }

    function adjustStake(uint8 who, uint96 rawAmount) external {
        if (!bootstrapped) return;
        address user = stakers[who % stakers.length];
        uint256 amount = bound(uint256(rawAmount), 0, 2_000e18);
        stakeManager.setStake(user, IStakeManager.Role.Platform, amount);
        _afterAction();
    }

    function updateTreasury(uint8 idx) external {
        if (!bootstrapped) return;
        address candidate;
        if (idx % 5 == 0) {
            candidate = address(0);
        } else {
            candidate = address(uint160(uint256(keccak256(abi.encode(idx, address(this))))));
            if (candidate == address(this) || candidate == address(0)) {
                candidate = address(0xFEE);
            }
        }
        feePool.setTreasuryAllowlist(candidate, true);
        feePool.setTreasury(candidate);
        treasury = candidate;
        _afterAction();
    }

    function togglePause(bool pause) external {
        if (!bootstrapped) return;
        if (pause && !feePool.paused()) {
            feePool.pause();
        } else if (!pause && feePool.paused()) {
            feePool.unpause();
        }
        _afterAction();
    }

    function maxCumulativeObserved() external view returns (uint256) {
        return maxCumulative;
    }

    function _afterAction() internal {
        uint256 current = feePool.cumulativePerToken();
        if (current > maxCumulative) {
            maxCumulative = current;
        }
    }
}

contract FeePoolAccountingInvariant is StdInvariant, Test {
    FeePool public feePool;
    MockStakeManager public stakeManager;
    AGIALPHAToken public token;
    FeePoolInvariantHandler public handler;

    function setUp() public {
        AGIALPHAToken impl = new AGIALPHAToken();
        vm.etch(AGIALPHA, address(impl).code);
        vm.store(AGIALPHA, bytes32(uint256(5)), bytes32(uint256(uint160(address(this)))));
        token = AGIALPHAToken(payable(AGIALPHA));

        stakeManager = new MockStakeManager();
        feePool = new FeePool(stakeManager, 0, address(0), ITaxPolicy(address(0)));

        handler = new FeePoolInvariantHandler(feePool, stakeManager, token);

        token.transferOwnership(address(handler));
        feePool.transferOwnership(address(handler));
        handler.bootstrap();

        targetContract(address(handler));
    }

    function invariant_pendingFeesBackedByBalance() public view {
        assertGe(token.balanceOf(address(feePool)), feePool.pendingFees(), "pending fees exceed balance");
    }

    function invariant_cumulativePerTokenMonotonic() public view {
        assertGe(feePool.cumulativePerToken(), handler.maxCumulativeObserved(), "cumulative per token regressed");
    }
}
