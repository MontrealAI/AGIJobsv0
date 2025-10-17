// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// @title AlphaMarkRiskOracle
/// @notice Validator council that approves whether a Nova-Seed launch is safe to finalize.
/// @dev Owner governance can adjust the validator set, thresholds, and pause participation
///      entirely if a circuit breaker is required. Approvals automatically track quorum and
///      emit events for comprehensive observability.
contract AlphaMarkRiskOracle is Ownable, Pausable {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice Revert emitted when the caller is not part of the validator set.
    error NotValidator(address account);

    /// @notice Revert emitted when a validator attempts to approve twice.
    error AlreadyApproved(address account);

    /// @notice Revert emitted when trying to revoke without a prior approval.
    error NoApprovalToRevoke(address account);

    /// @notice Revert emitted when the requested threshold is invalid.
    error InvalidApprovalThreshold(uint256 requested, uint256 validatorCount);

    /// @notice Emitted whenever a validator joins the council.
    event ValidatorAdded(address indexed validator);

    /// @notice Emitted whenever a validator leaves the council.
    event ValidatorRemoved(address indexed validator);

    /// @notice Emitted after the owner adjusts the approval threshold.
    event ApprovalThresholdUpdated(uint256 newThreshold);

    /// @notice Emitted when a validator casts an approval vote.
    event ApprovalCast(address indexed validator);

    /// @notice Emitted when a validator revokes their approval vote.
    event ApprovalRevoked(address indexed validator);

    /// @notice Emitted when approvals are wiped and state is reset.
    event ApprovalsReset();

    /// @notice Emitted when the owner forces an override status.
    event ValidationOverrideUpdated(bool enabled, bool status);

    EnumerableSet.AddressSet private _validators;
    mapping(address => bool) public hasApproved;

    uint256 public approvalCount;
    uint256 public approvalThreshold;

    bool public overrideEnabled;
    bool public overrideStatus;

    /// @param owner_ Administrator that can curate validators and override state.
    /// @param initialValidators Initial council roster.
    /// @param threshold Initial approval threshold. A value of zero derives a majority.
    constructor(address owner_, address[] memory initialValidators, uint256 threshold) Ownable(owner_) {
        _batchAddValidators(initialValidators);
        _setThresholdInternal(threshold == 0 ? _defaultThreshold() : threshold);
    }

    /// @notice Configure the minimum validator approvals required to pass.
    /// @param newThreshold Target approval threshold (>0 and <= validator count).
    function setApprovalThreshold(uint256 newThreshold) external onlyOwner {
        _setThresholdInternal(newThreshold);
    }

    /// @notice Add new validators to the council.
    /// @param validators Addresses that should gain voting rights.
    function addValidators(address[] calldata validators) external onlyOwner {
        _batchAddValidators(validators);
        if (approvalThreshold == 0) {
            _setThresholdInternal(_defaultThreshold());
        } else if (approvalThreshold > validatorCount()) {
            _setThresholdInternal(validatorCount());
        }
    }

    /// @notice Remove validators from the council.
    /// @param validators Addresses that should lose voting rights.
    function removeValidators(address[] calldata validators) external onlyOwner {
        for (uint256 i = 0; i < validators.length; i++) {
            address validator = validators[i];
            if (!_validators.remove(validator)) {
                continue;
            }
            if (hasApproved[validator]) {
                hasApproved[validator] = false;
                approvalCount -= 1;
                emit ApprovalRevoked(validator);
            }
            emit ValidatorRemoved(validator);
        }

        if (validatorCount() == 0) {
            approvalCount = 0;
            _setThresholdInternal(0);
            emit ApprovalsReset();
        } else if (approvalThreshold > validatorCount()) {
            _setThresholdInternal(validatorCount());
        }
    }

    /// @notice Allow a validator to cast their approval vote.
    function approveSeed() external whenNotPaused {
        address validator = msg.sender;
        if (!isValidator(validator)) {
            revert NotValidator(validator);
        }
        if (hasApproved[validator]) {
            revert AlreadyApproved(validator);
        }
        hasApproved[validator] = true;
        approvalCount += 1;
        emit ApprovalCast(validator);
    }

    /// @notice Allow a validator to revoke a previously cast approval.
    function revokeApproval() external whenNotPaused {
        address validator = msg.sender;
        if (!isValidator(validator)) {
            revert NotValidator(validator);
        }
        if (!hasApproved[validator]) {
            revert NoApprovalToRevoke(validator);
        }
        hasApproved[validator] = false;
        approvalCount -= 1;
        emit ApprovalRevoked(validator);
    }

    /// @notice Owner-level function to clear all approvals.
    function resetApprovals() external onlyOwner {
        if (approvalCount == 0) {
            return;
        }
        address[] memory validators = _validators.values();
        for (uint256 i = 0; i < validators.length; i++) {
            address validator = validators[i];
            if (hasApproved[validator]) {
                hasApproved[validator] = false;
            }
        }
        approvalCount = 0;
        emit ApprovalsReset();
    }

    /// @notice Pause all validator activity.
    function pauseOracle() external onlyOwner {
        _pause();
    }

    /// @notice Resume validator activity.
    function unpauseOracle() external onlyOwner {
        _unpause();
    }

    /// @notice Apply an owner override to the validation outcome.
    /// @param enabled Whether to respect the override.
    /// @param status Validation status returned while override is active.
    function setOverride(bool enabled, bool status) external onlyOwner {
        overrideEnabled = enabled;
        overrideStatus = status;
        emit ValidationOverrideUpdated(enabled, status);
    }

    /// @notice Determine whether the launch is validated.
    /// @return True when override is active or approvals meet the threshold.
    function seedValidated() public view returns (bool) {
        if (overrideEnabled) {
            return overrideStatus;
        }
        uint256 threshold = approvalThreshold;
        if (threshold == 0) {
            return false;
        }
        return approvalCount >= threshold;
    }

    /// @notice Number of validators in the council.
    function validatorCount() public view returns (uint256) {
        return _validators.length();
    }

    /// @notice Determine whether an account is a validator.
    function isValidator(address account) public view returns (bool) {
        return _validators.contains(account);
    }

    /// @notice Fetch the entire validator roster.
    function getValidators() external view returns (address[] memory) {
        return _validators.values();
    }

    function _batchAddValidators(address[] memory validators) internal {
        for (uint256 i = 0; i < validators.length; i++) {
            address validator = validators[i];
            if (validator == address(0) || _validators.contains(validator)) {
                continue;
            }
            _validators.add(validator);
            emit ValidatorAdded(validator);
        }
    }

    function _defaultThreshold() internal view returns (uint256) {
        uint256 count = validatorCount();
        if (count == 0) {
            return 0;
        }
        return (count / 2) + 1; // strict majority
    }

    function _setThresholdInternal(uint256 newThreshold) internal {
        uint256 count = validatorCount();
        if (newThreshold == 0) {
            approvalThreshold = count == 0 ? 0 : (count / 2) + 1;
        } else {
            if (newThreshold > count) {
                revert InvalidApprovalThreshold(newThreshold, count);
            }
            approvalThreshold = newThreshold;
        }
        emit ApprovalThresholdUpdated(approvalThreshold);
    }
}
