// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {QuadraticVoting} from "../v2/QuadraticVoting.sol";
import {ReentrantERC20, IReentrantCaller} from "./ReentrantERC20.sol";

/// @dev Helper contract to trigger reentrancy attacks against QuadraticVoting.
contract QuadraticVotingAttack is IReentrantCaller {
    enum AttackType {
        Cast,
        Refund
    }

    QuadraticVoting public qv;
    ReentrantERC20 public token;
    uint256 public proposalId;
    uint256 public deadline;
    AttackType public attackType;

    constructor(address _qv, address _token, uint256 _proposalId, uint256 _deadline) {
        qv = QuadraticVoting(_qv);
        token = ReentrantERC20(_token);
        proposalId = _proposalId;
        deadline = _deadline;
    }

    function attackCast() external {
        attackType = AttackType.Cast;
        token.approve(address(qv), type(uint256).max);
        token.setCaller(address(this));
        token.setAttack(true);
        qv.castVote(proposalId, 1, deadline);
    }

    function attackRefund() external {
        attackType = AttackType.Refund;
        token.setCaller(address(this));
        token.setAttack(true);
        qv.claimRefund(proposalId);
    }

    function vote() external {
        token.approve(address(qv), type(uint256).max);
        qv.castVote(proposalId, 1, deadline);
    }

    function reenter() external override {
        if (attackType == AttackType.Cast) {
            qv.castVote(proposalId, 1, deadline);
        } else if (attackType == AttackType.Refund) {
            qv.claimRefund(proposalId);
        }
    }
}
