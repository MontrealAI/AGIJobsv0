// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IFeePool} from "../interfaces/IFeePool.sol";

interface IStakeManager {
    function finalizeJobFunds(
        bytes32 jobId,
        address employer,
        address agent,
        uint256 reward,
        uint256 validatorReward,
        uint256 fee,
        IFeePool feePool,
        bool byGovernance
    ) external;

    function distributeValidatorRewards(bytes32 jobId, uint256 amount) external;

    function lockReward(bytes32 jobId, address from, uint256 amount) external;
}

interface IReentrantToken {
    function setAttack(bool) external;
}

/// @dev Minimal JobRegistry mock used to attempt reentrancy on StakeManager calls.
contract ReentrantJobRegistry {
    IStakeManager public stakeManager;
    IReentrantToken public token;

    enum AttackType { None, Finalize, Validator }
    AttackType public attackType;
    bytes32 public jobId;
    address public agent;
    address public employer;
    uint256 public reward;
    uint256 public amount;

    /// @dev Mirror of ReentrancyGuard's custom error so tests can detect it even when bubbling fails.
    error ReentrancyGuardReentrantCall();

    function version() external pure returns (uint256) {
        return 2;
    }

    constructor(address sm, address token_) {
        stakeManager = IStakeManager(sm);
        token = IReentrantToken(token_);
    }

    function lockReward(bytes32 _jobId, address from, uint256 _amount) external {
        stakeManager.lockReward(_jobId, from, _amount);
    }

    function attackFinalize(bytes32 _jobId, address _agent, uint256 _reward) external {
        jobId = _jobId;
        agent = _agent;
        employer = msg.sender;
        reward = _reward;
        attackType = AttackType.Finalize;
        token.setAttack(true);
        stakeManager.finalizeJobFunds(jobId, employer, agent, reward, 0, 0, IFeePool(address(0)), false);
        attackType = AttackType.None;
    }

    function attackValidator(bytes32 _jobId, uint256 _amount) external {
        jobId = _jobId;
        amount = _amount;
        attackType = AttackType.Validator;
        token.setAttack(true);
        stakeManager.distributeValidatorRewards(jobId, amount);
        attackType = AttackType.None;
    }

    // called by the token during transfer to attempt reentrancy
    function reenter() external {
        if (attackType == AttackType.Finalize) {
            try stakeManager.finalizeJobFunds(
                jobId,
                employer,
                agent,
                reward,
                0,
                0,
                IFeePool(address(0)),
                false
            ) {
                revert ReentrancyGuardReentrantCall();
            } catch (bytes memory reason) {
                _bubble(reason);
            }
        } else if (attackType == AttackType.Validator) {
            try stakeManager.distributeValidatorRewards(jobId, amount) {
                revert ReentrancyGuardReentrantCall();
            } catch (bytes memory reason) {
                _bubble(reason);
            }
        }
    }

    function _bubble(bytes memory reason) private pure {
        if (reason.length == 0) {
            revert ReentrancyGuardReentrantCall();
        }
        assembly {
            revert(add(reason, 0x20), mload(reason))
        }
    }
}

