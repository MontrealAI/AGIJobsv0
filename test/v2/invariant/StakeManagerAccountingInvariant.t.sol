// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/StdInvariant.sol";
import "forge-std/Test.sol";
import "forge-std/Vm.sol";

import {StakeManager} from "../../../contracts/v2/StakeManager.sol";
import {TaxPolicy} from "../../../contracts/v2/TaxPolicy.sol";
import {JobRegistryAckRecorder} from "../../../contracts/v2/mocks/JobRegistryAckRecorder.sol";
import {AGIALPHAToken} from "../../../contracts/test/AGIALPHAToken.sol";
import {AGIALPHA} from "../../../contracts/v2/Constants.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

contract StakeManagerHandler {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    StakeManager public immutable stake;
    AGIALPHAToken public immutable token;
    TaxPolicy public immutable policy;
    address public immutable tokenOwner;

    address[] internal tracked;

    constructor(StakeManager _stake, AGIALPHAToken _token, TaxPolicy _policy, address _tokenOwner) {
        stake = _stake;
        token = _token;
        policy = _policy;
        tokenOwner = _tokenOwner;
        tracked.push(address(0xA11CE));
        tracked.push(address(0xB0B));
        tracked.push(address(0xC0FFEE));
        tracked.push(address(0xD00D));
    }

    function totalTrackedStake(StakeManager.Role role) external view returns (uint256 total) {
        uint256 len = tracked.length;
        for (uint256 i; i < len; ++i) {
            total += stake.stakes(tracked[i], role);
        }
    }

    function depositAgent(uint8 who, uint96 rawAmount) external {
        _depositRole(who, rawAmount, StakeManager.Role.Agent);
    }

    function depositValidator(uint8 who, uint96 rawAmount) external {
        _depositRole(who, rawAmount, StakeManager.Role.Validator);
    }

    function withdrawAgent(uint8 who, uint96 rawAmount) external {
        _withdrawRole(who, rawAmount, StakeManager.Role.Agent);
    }

    function withdrawValidator(uint8 who, uint96 rawAmount) external {
        _withdrawRole(who, rawAmount, StakeManager.Role.Validator);
    }

    function _depositRole(uint8 who, uint96 rawAmount, StakeManager.Role role) internal {
        address user = tracked[who % tracked.length];
        uint256 minStake = stake.minStake();
        uint256 amount = minStake + (uint256(rawAmount) % (1000 * minStake));

        if (!policy.hasAcknowledged(user)) {
            policy.acknowledgeFor(user);
        }

        vm.startPrank(tokenOwner);
        token.mint(user, amount);
        vm.stopPrank();

        vm.startPrank(user);
        token.approve(address(stake), amount);
        stake.depositStake(role, amount);
        vm.stopPrank();
    }

    function _withdrawRole(uint8 who, uint96 rawAmount, StakeManager.Role role) internal {
        address user = tracked[who % tracked.length];
        uint256 staked = stake.stakes(user, role);
        if (staked == 0) return;
        uint256 minStake = stake.minStake();
        uint256 amount;
        if (staked <= minStake) {
            amount = staked;
        } else {
            amount = 1 + (uint256(rawAmount) % staked);
            if (staked > minStake && staked - amount != 0 && staked - amount < minStake) {
                amount = staked;
            }
        }

        if (!policy.hasAcknowledged(user)) {
            policy.acknowledgeFor(user);
        }

        vm.startPrank(user);
        stake.withdrawStake(role, amount);
        vm.stopPrank();
    }
}

contract StakeManagerAccountingInvariant is StdInvariant, Test {
    StakeManager public stake;
    StakeManagerHandler public handler;
    AGIALPHAToken public token;
    TimelockController public timelock;
    TaxPolicy public taxPolicy;

    function setUp() public {
        AGIALPHAToken impl = new AGIALPHAToken();
        vm.etch(AGIALPHA, address(impl).code);
        vm.store(AGIALPHA, bytes32(uint256(5)), bytes32(uint256(uint160(address(this)))));
        token = AGIALPHAToken(payable(AGIALPHA));

        address[] memory proposers = new address[](1);
        proposers[0] = address(this);
        address[] memory executors = new address[](1);
        executors[0] = address(this);
        timelock = new TimelockController(2, proposers, executors, address(this));

        taxPolicy = new TaxPolicy("ipfs://policy", "ack");

        JobRegistryAckRecorder ack = new JobRegistryAckRecorder(taxPolicy);
        stake = new StakeManager(1e18, 5_000, 5_000, address(0), address(ack), address(0), address(timelock));

        // Allow the stake manager to move tokens during withdrawals by
        // acknowledging the AGIALPHA terms on its behalf. In production the
        // owner would submit this acknowledgement post-deployment; replicating
        // it here keeps the invariant harness aligned with live operations.
        vm.prank(address(stake));
        token.acceptTerms();

        handler = new StakeManagerHandler(stake, token, taxPolicy, address(this));
        taxPolicy.setAcknowledger(address(handler), true);

        targetContract(address(handler));
    }

    function invariant_totalStakeAccounting() public view {
        uint256 agentSum = handler.totalTrackedStake(StakeManager.Role.Agent);
        uint256 validatorSum = handler.totalTrackedStake(StakeManager.Role.Validator);
        assertEq(agentSum, stake.totalStakes(StakeManager.Role.Agent), "agent stake mismatch");
        assertEq(validatorSum, stake.totalStakes(StakeManager.Role.Validator), "validator stake mismatch");
    }

    function invariant_stakeManagerSolvent() public view {
        uint256 liabilities = stake.totalStakes(StakeManager.Role.Agent)
            + stake.totalStakes(StakeManager.Role.Validator) + stake.totalStakes(StakeManager.Role.Platform)
            + stake.operatorRewardPool();
        uint256 balance = token.balanceOf(address(stake));
        assertGe(balance, liabilities, "stake manager insolvent");
    }
}
