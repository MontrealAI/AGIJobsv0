// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// @title AlphaMarkRiskOracle
/// @notice Permissioned validator council that approves or rejects a Nova-Seed launch.
contract AlphaMarkRiskOracle is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    event ValidatorAdded(address indexed validator);
    event ValidatorRemoved(address indexed validator);
    event ApprovalThresholdUpdated(uint256 newThreshold);
    event ApprovalCast(address indexed validator, bool approved);
    event ApprovalRevoked(address indexed validator);
    event ValidationOverrideSet(bool forcedStatus);
    event ApprovalsReset();

    EnumerableSet.AddressSet private _validators;
    mapping(address => bool) public hasApproved;

    uint256 public approvalCount;
    uint256 public approvalThreshold;

    bool public overrideEnabled;
    bool public overrideStatus;

    constructor(address owner_, address[] memory initialValidators, uint256 threshold) Ownable(owner_) {
        approvalThreshold = threshold;
        _batchAddValidators(initialValidators);
        _ensureThresholdWithinBounds();
        if (approvalThreshold != 0 && approvalThreshold > validatorCount()) {
            revert("Threshold above validator count");
        }
    }

    function setApprovalThreshold(uint256 newThreshold) external onlyOwner {
        require(newThreshold > 0, "Threshold must be > 0");
        require(newThreshold <= validatorCount(), "Threshold above validator count");
        approvalThreshold = newThreshold;
        emit ApprovalThresholdUpdated(newThreshold);
    }

    function addValidators(address[] memory validators) external onlyOwner {
        _batchAddValidators(validators);
        _ensureThresholdWithinBounds();
    }

    function removeValidators(address[] memory validators) external onlyOwner {
        for (uint256 i = 0; i < validators.length; i++) {
            address validator = validators[i];
            if (!_validators.remove(validator)) continue;
            if (hasApproved[validator]) {
                hasApproved[validator] = false;
                approvalCount -= 1;
                emit ApprovalRevoked(validator);
            }
            emit ValidatorRemoved(validator);
        }
        _ensureThresholdWithinBounds();
    }

    function approveSeed() external {
        require(isValidator(msg.sender), "Not validator");
        if (hasApproved[msg.sender]) revert("Already approved");
        hasApproved[msg.sender] = true;
        approvalCount += 1;
        emit ApprovalCast(msg.sender, true);
    }

    function revokeApproval() external {
        require(isValidator(msg.sender), "Not validator");
        if (!hasApproved[msg.sender]) revert("No approval");
        hasApproved[msg.sender] = false;
        approvalCount -= 1;
        emit ApprovalRevoked(msg.sender);
    }

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

    function seedValidated() public view returns (bool) {
        if (overrideEnabled) {
            return overrideStatus;
        }
        return approvalCount >= approvalThreshold && approvalThreshold > 0;
    }

    function setOverride(bool enabled, bool status) external onlyOwner {
        overrideEnabled = enabled;
        overrideStatus = status;
        emit ValidationOverrideSet(enabled ? status : false);
    }

    function validatorCount() public view returns (uint256) {
        return _validators.length();
    }

    function isValidator(address account) public view returns (bool) {
        return _validators.contains(account);
    }

    function getValidators() external view returns (address[] memory) {
        return _validators.values();
    }

    function _batchAddValidators(address[] memory validators) internal {
        for (uint256 i = 0; i < validators.length; i++) {
            address validator = validators[i];
            if (validator == address(0) || _validators.contains(validator)) continue;
            _validators.add(validator);
            emit ValidatorAdded(validator);
        }
    }

    function _ensureThresholdWithinBounds() internal {
        uint256 currentCount = validatorCount();
        uint256 updatedThreshold = approvalThreshold;

        if (currentCount == 0) {
            updatedThreshold = 0;
        } else if (approvalThreshold == 0 || approvalThreshold > currentCount) {
            updatedThreshold = (currentCount + 1) / 2;
        }

        if (updatedThreshold != approvalThreshold) {
            approvalThreshold = updatedThreshold;
            emit ApprovalThresholdUpdated(updatedThreshold);
        }
    }
}
