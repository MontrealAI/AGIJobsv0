// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ValidatorRiskOracle
 * @notice Collects validator approvals for a Nova-Seed and exposes the aggregated confidence signal.
 */
contract ValidatorRiskOracle is Ownable, Pausable {
    event ValidatorAdded(address indexed account);
    event ValidatorRemoved(address indexed account);
    event VoteCast(address indexed validator, bool approved);
    event ApprovalsRequiredUpdated(uint256 newRequirement);
    event ValidationOverridden(address indexed caller, bool approved);

    struct VoteState {
        bool exists;
        bool approved;
    }

    mapping(address => bool) private _validators;
    mapping(address => VoteState) private _votes;

    uint256 private _validatorCount;
    uint256 private _approvals;
    uint256 private _approvalsRequired;
    bool private _seedValidated;

    constructor(address owner_, uint256 approvalsRequired_) Ownable(owner_) {
        require(owner_ != address(0), "owner zero");
        _setApprovalsRequired(approvalsRequired_);
    }

    modifier onlyValidator() {
        require(_validators[msg.sender], "not validator");
        _;
    }

    function addValidator(address account) external onlyOwner {
        require(account != address(0), "validator zero");
        require(!_validators[account], "already validator");
        _validators[account] = true;
        _validatorCount += 1;
        emit ValidatorAdded(account);
    }

    function removeValidator(address account) external onlyOwner {
        require(_validators[account], "not validator");
        _validators[account] = false;
        _validatorCount -= 1;
        if (_votes[account].exists && _votes[account].approved) {
            _approvals -= 1;
        }
        delete _votes[account];
        emit ValidatorRemoved(account);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setApprovalsRequired(uint256 newRequirement) external onlyOwner {
        _setApprovalsRequired(newRequirement);
    }

    function castVote(bool approve) external onlyValidator whenNotPaused {
        VoteState storage vote = _votes[msg.sender];
        if (!vote.exists) {
            vote.exists = true;
            if (approve) {
                _approvals += 1;
            }
        } else if (vote.approved != approve) {
            if (approve) {
                _approvals += 1;
            } else {
                _approvals -= 1;
            }
        }
        vote.approved = approve;

        if (!_seedValidated && _approvalsRequired > 0 && _approvals >= _approvalsRequired) {
            _seedValidated = true;
        }

        emit VoteCast(msg.sender, approve);
    }

    function overrideValidation(bool approved) external onlyOwner {
        _seedValidated = approved;
        emit ValidationOverridden(msg.sender, approved);
    }

    function approvalsRequired() external view returns (uint256) {
        return _approvalsRequired;
    }

    function approvalsCount() external view returns (uint256) {
        return _approvals;
    }

    function totalValidators() external view returns (uint256) {
        return _validatorCount;
    }

    function seedValidated() external view returns (bool) {
        return _seedValidated;
    }

    function validatorVote(address validator) external view returns (bool hasVoted, bool approved) {
        VoteState memory vote = _votes[validator];
        return (vote.exists, vote.approved);
    }

    function isValidator(address account) external view returns (bool) {
        return _validators[account];
    }

    function _setApprovalsRequired(uint256 newRequirement) private {
        require(newRequirement <= _validatorCount || _validatorCount == 0, "requirement too high");
        _approvalsRequired = newRequirement;
        emit ApprovalsRequiredUpdated(newRequirement);
    }
}
